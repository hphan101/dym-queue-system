// Google Spreadsheet dùng chung cho ba chi nhánh. Không đổi ID này theo dữ liệu từ client.
var SPREADSHEET_ID = "1TpuxeEFs9ToqK-xnXplmJ40P0Jk7xC55TAFCggfa8eg";

// Chỉ các mã chi nhánh này mới được phép ghi. Tên tab và nhãn hiển thị đều cố định.
var BRANCH_CONFIG = {
  q1: { sheetName: "D1", label: "DYM mPlaza Quận 1" },
  q7: { sheetName: "D7", label: "DYM The Grace Quận 7" },
  hn: { sheetName: "HN", label: "DYM Epic Tower Cầu Giấy" }
};

var REGISTRATION_HEADERS = [
  "Số thứ tự",
  "Thời gian submit",
  "Chi nhánh",
  "Họ tên",
  "Ngày sinh",
  "Giới tính",
  "Số điện thoại",
  "CCCD",
  "Tên công ty",
  "Tỉnh/Thành phố",
  "Phường/Xã",
  "Địa chỉ chi tiết",
  "Trạng thái xử lý"
];

// Hàm chính xử lý request POST gửi từ Frontend React
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // Giảm thời gian chờ lock xuống tối đa 10s để phản hồi nhanh hơn nếu quá tải
  } catch (error) {
    return createJsonResponse({ success: false, error: "Hệ thống đang bận. Vui lòng thử lại!" });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Không nhận được dữ liệu");
    }
    
    // Parse dữ liệu JSON nhận được
    var data = JSON.parse(e.postData.contents);

    if (!isValidPayloadShape(data)) {
      lock.releaseLock();
      return createInvalidDataResponse();
    }

    var branch = data.branch.trim().toLowerCase();
    var branchConfig = BRANCH_CONFIG[branch];
    if (!branchConfig) {
      lock.releaseLock();
      return createInvalidDataResponse();
    }
    
    // 1. Kiểm tra và phát hiện bẫy Honeypot chống spam bot
    var honeypot = (data.honeypot || "").trim();
    if (honeypot.length > 0) {
      // Trả về số thứ tự giả cho bot, không lưu vào Sheet
      lock.releaseLock();
      return createJsonResponse({ success: true, queueNumber: "0999" });
    }
    
    // Hàm làm sạch dữ liệu chống Formula Injection (Ngăn chạy mã độc công thức)
    function sanitizeInput(val) {
      var str = (val === null || val === undefined) ? "" : String(val).trim();
      if (str.length > 0) {
        var firstChar = str.charAt(0);
        if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@') {
          return "'" + str; // Thêm nháy đơn ở đầu để Excel/Sheets coi là chữ thường
        }
      }
      return str;
    }
    
    var fullName = sanitizeInput(data.fullName);
    var phoneNumber = sanitizeInput(data.phoneNumber);
    var birthDate = sanitizeInput(data.birthDate);
    var gender = sanitizeInput(data.gender);
    var cccd = sanitizeInput(data.cccd);
    var companyName = sanitizeInput(data.companyName);
    var province = sanitizeInput(data.province);
    var ward = sanitizeInput(data.ward);
    var addressDetail = sanitizeInput(data.addressDetail);
    
    // Kiểm tra dữ liệu bắt buộc (ngoại trừ tên công ty là tự chọn)
    if (!fullName || !phoneNumber || !birthDate || !gender || !cccd || !province || !ward || !addressDetail) {
      throw new Error("Vui lòng điền đầy đủ các thông tin bắt buộc!");
    }

    if (!isValidRegistrationData({
      fullName: fullName,
      phoneNumber: phoneNumber,
      birthDate: birthDate,
      gender: gender,
      cccd: cccd,
      companyName: companyName,
      province: province,
      ward: ward,
      addressDetail: addressDetail
    })) {
      lock.releaseLock();
      return createInvalidDataResponse();
    }
    
    // Mở đúng Spreadsheet và tab đã được whitelist; không bao giờ dùng getActiveSheet().
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(branchConfig.sheetName);
    if (!sheet) {
      console.error("Configured branch sheet was not found: " + branchConfig.sheetName);
      lock.releaseLock();
      return createJsonResponse({
        success: false,
        error: "Hệ thống đang cấu hình chi nhánh. Vui lòng liên hệ DYM."
      });
    }
    var lastRow = sheet.getLastRow(); // Gọi 1 lần duy nhất để tối ưu tốc độ đọc ghi
    
    // Tạo dòng tiêu đề nếu sheet hoàn toàn trống (lastRow == 0)
    if (lastRow === 0) {
      setupHeader(sheet);
      lastRow = 1; // Sau khi tạo dòng tiêu đề, dòng cuối cùng hiện tại là dòng 1
    } else if (!hasCurrentHeaderLayout(sheet)) {
      lock.releaseLock();
      return createJsonResponse({
        success: false,
        error: "Sheet đang dùng cấu trúc cũ. Vui lòng chạy migration trước khi nhận đăng ký mới."
      });
    }

    var rateLimit = enforceRegistrationCooldown(phoneNumber, cccd, branch);
    if (!rateLimit.allowed) {
      return createJsonResponse({
        success: false,
        code: "RATE_LIMITED",
        error: "Vui lòng thử lại sau " + rateLimit.retryAfterMinutes + " phút."
      });
    }
    
    var vnTimeZone = "Asia/Ho_Chi_Minh";
    var now = new Date();
    var formattedSubmitTime = Utilities.formatDate(now, vnTimeZone, "dd/MM/yyyy HH:mm:ss");
    var todayDateString = Utilities.formatDate(now, vnTimeZone, "dd/MM/yyyy");
    
    // Sinh STT độc lập theo chi nhánh/ngày, không phụ thuộc vào vị trí hoặc thứ tự dòng Sheet.
    var queueNumber = generateQueueNumber(branch, sheet, lastRow, todayDateString);
    
    // Lưu thông tin vào Sheet, dùng dấu nháy đơn (') để ép định dạng chữ (tránh mất số 0 ở đầu)
    sheet.appendRow([
      "'" + queueNumber,
      formattedSubmitTime,
      branchConfig.label,
      fullName,
      birthDate,
      gender,
      "'" + phoneNumber,
      "'" + cccd,
      companyName,
      province,
      ward,
      addressDetail,
      "Chờ khám"
    ]);
    
    lock.releaseLock(); // Giải phóng lock
    return createJsonResponse({ success: true, queueNumber: queueNumber });
    
  } catch (err) {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
    return createJsonResponse({ success: false, error: err.message || "Lỗi hệ thống" });
  }
}

// Tạo dòng tiêu đề cho Google Sheet nếu chưa có dữ liệu
function setupHeader(sheet) {
  sheet.appendRow(REGISTRATION_HEADERS);
  sheet.getRange(1, 1, 1, REGISTRATION_HEADERS.length).setFontWeight("bold");
}

function hasCurrentHeaderLayout(sheet) {
  var headers = sheet.getRange(1, 1, 1, REGISTRATION_HEADERS.length).getDisplayValues()[0];
  return headers.join("|") === REGISTRATION_HEADERS.join("|");
}

// Chạy một lần thủ công trong Apps Script Editor sau khi dán Code.gs mới.
// Hàm này chuyển dữ liệu cũ của D1, D7, HN sang cấu trúc cột mới mà không làm mất dữ liệu.
function migrateBranchSheetsToNewLayout() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var branchCodes = Object.keys(BRANCH_CONFIG);

  for (var i = 0; i < branchCodes.length; i++) {
    var config = BRANCH_CONFIG[branchCodes[i]];
    var sheet = ss.getSheetByName(config.sheetName);
    if (!sheet) {
      throw new Error("Không tìm thấy Sheet tab: " + config.sheetName);
    }

    if (sheet.getLastRow() === 0) {
      setupHeader(sheet);
      continue;
    }

    if (hasCurrentHeaderLayout(sheet)) {
      continue;
    }

    var oldHeaders = sheet.getRange(1, 1, 1, 12).getDisplayValues()[0];
    if (oldHeaders[0] !== "Số thứ tự" || oldHeaders[1] !== "Thời gian submit" ||
        oldHeaders[2] !== "Họ tên" || oldHeaders[3] !== "Số điện thoại") {
      throw new Error("Sheet " + config.sheetName + " không có cấu trúc cũ như dự kiến. Không tự chuyển dữ liệu.");
    }

    var lastRow = sheet.getLastRow();
    var oldRows = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, 12).getValues()
      : [];
    var newRows = [REGISTRATION_HEADERS];

    for (var rowIndex = 0; rowIndex < oldRows.length; rowIndex++) {
      var row = oldRows[rowIndex];
      newRows.push([
        row[0], row[1], config.label, row[2], row[4], row[5], row[3], row[6],
        row[7], row[8], row[9], row[10], row[11]
      ]);
    }

    sheet.clearContents();
    sheet.getRange(1, 1, newRows.length, REGISTRATION_HEADERS.length).setValues(newRows);
    sheet.getRange(1, 1, 1, REGISTRATION_HEADERS.length).setFontWeight("bold");
  }
}

// Bộ đếm được lưu riêng cho từng chi nhánh. Script Lock trong doPost bảo đảm thao tác tăng là nguyên tử.
function generateQueueNumber(branch, sheet, lastRow, todayStr) {
  var properties = PropertiesService.getScriptProperties();
  var propertyKey = "queue-counter-v1-" + branch;
  var storedValue = properties.getProperty(propertyKey);
  var counter = null;

  if (storedValue) {
    try {
      counter = JSON.parse(storedValue);
    } catch (error) {
      console.warn("Queue counter could not be parsed for branch " + branch);
    }
  }

  // Lần đầu deploy hoặc khi property bị xóa: khôi phục STT lớn nhất của ngày hiện tại,
  // nên không sinh trùng số ngay cả khi Sheet đã có dữ liệu hoặc bị sort.
  var lastIssuedNumber = counter && counter.date === todayStr
    ? counter.number
    : (counter ? 0 : findHighestQueueNumberForDate(sheet, lastRow, todayStr));

  var nextNumber = (parseInt(lastIssuedNumber, 10) || 0) + 1;
  properties.setProperty(propertyKey, JSON.stringify({ date: todayStr, number: nextNumber }));
  return padZero(nextNumber, 4);
}

function findHighestQueueNumberForDate(sheet, lastRow, todayStr) {
  if (lastRow <= 1) {
    return 0;
  }

  // Chỉ chạy khi khởi tạo/mất property; các lần đăng ký thông thường không cần đọc lại Sheet.
  var rows = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  var highestNumber = 0;

  for (var i = 0; i < rows.length; i++) {
    var queueNumber = parseInt(rows[i][0], 10);
    var submitDate = rows[i][1] ? rows[i][1].split(" ")[0] : "";
    if (submitDate === todayStr && !isNaN(queueNumber)) {
      highestNumber = Math.max(highestNumber, queueNumber);
    }
  }

  return highestNumber;
}

// Thêm các số 0 ở trước (ví dụ: 5 -> 0005)
function padZero(num, size) {
  var s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
}

// Trả về JSON đúng chuẩn để Frontend nhận được dữ liệu
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Kiểm tra phiên bản đang chạy bằng cách mở link Web App trên trình duyệt
function doGet(e) {
  return ContentService.createTextOutput("DYM Queue System Backend - Phiên bản 3.0 (Đã tối ưu hóa tốc độ)");
}

function enforceRegistrationCooldown(phoneNumber, cccd, branch) {
  var cooldownSeconds = getRegistrationCooldownSeconds();
  var fingerprint = createRegistrationFingerprint(phoneNumber, cccd, branch);
  var cache = CacheService.getScriptCache();
  var cacheKey = "queue-registration-v1-" + fingerprint;

  if (cache.get(cacheKey)) {
    return {
      allowed: false,
      retryAfterMinutes: Math.ceil(cooldownSeconds / 60)
    };
  }

  cache.put(cacheKey, "1", cooldownSeconds);
  return { allowed: true, retryAfterMinutes: 0 };
}

function getRegistrationCooldownSeconds() {
  var configuredValue = PropertiesService.getScriptProperties()
    .getProperty("REGISTRATION_COOLDOWN_SECONDS");
  var seconds = parseInt(configuredValue, 10);
  if (isNaN(seconds) || seconds < 60 || seconds > 21600) {
    return 600;
  }
  return seconds;
}

function createRegistrationFingerprint(phoneNumber, cccd, branch) {
  var normalizedPhone = String(phoneNumber).replace(/[^0-9]/g, "");
  var normalizedCccd = String(cccd).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  var value = normalizedPhone + "|" + normalizedCccd + "|" + branch;
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value);

  return digest.map(function(byte) {
    var unsignedByte = byte < 0 ? byte + 256 : byte;
    return ("0" + unsignedByte.toString(16)).slice(-2);
  }).join("");
}

// Kiểm tra kiểu dữ liệu trước khi làm sạch để object/array không thể bị ép sang chuỗi hợp lệ.
function isValidPayloadShape(data) {
  if (!data || Object.prototype.toString.call(data) !== "[object Object]") {
    return false;
  }

  var requiredFields = [
    "branch", "fullName", "phoneNumber", "birthDate", "gender", "cccd",
    "province", "ward", "addressDetail"
  ];

  for (var i = 0; i < requiredFields.length; i++) {
    if (typeof data[requiredFields[i]] !== "string") {
      return false;
    }
  }

  return (!Object.prototype.hasOwnProperty.call(data, "companyName") || typeof data.companyName === "string") &&
    (!Object.prototype.hasOwnProperty.call(data, "honeypot") || typeof data.honeypot === "string");
}

// Toàn bộ kiểm tra này chỉ thao tác chuỗi/regex, không gọi Sheet hay dịch vụ bên ngoài.
function isValidRegistrationData(data) {
  return isValidText(data.fullName, 2, 100) &&
    isValidPhoneNumber(data.phoneNumber) &&
    isValidBirthDate(data.birthDate) &&
    (data.gender === "Nam" || data.gender === "Nữ") &&
    /^(?:[0-9]{12}|[A-Za-z][A-Za-z0-9]{6,12})$/.test(data.cccd) &&
    isValidText(data.companyName, 0, 150) &&
    isValidText(data.province, 1, 120) &&
    isValidText(data.ward, 1, 120) &&
    isValidText(data.addressDetail, 3, 250);
}

function isValidText(value, minLength, maxLength) {
  return typeof value === "string" &&
    value.length >= minLength &&
    value.length <= maxLength &&
    !/[\u0000-\u001F\u007F]/.test(value);
}

function isValidPhoneNumber(phoneNumber) {
  return /^(?:03|05|07|08|09)[0-9]{8}$/.test(phoneNumber);
}

function isValidBirthDate(birthDate) {
  var dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!dateMatch) {
    return false;
  }

  var year = parseInt(dateMatch[1], 10);
  var month = parseInt(dateMatch[2], 10);
  var day = parseInt(dateMatch[3], 10);
  var parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (year < 1900 || parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) {
    return false;
  }

  var today = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "yyyy-MM-dd");
  return birthDate <= today;
}

function createInvalidDataResponse() {
  return createJsonResponse({
    success: false,
    code: "INVALID_DATA",
    error: "Dữ liệu đăng ký không hợp lệ. Vui lòng kiểm tra lại thông tin."
  });
}
