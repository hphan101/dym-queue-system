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
    
    // Lấy sheet hoạt động
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    var lastRow = sheet.getLastRow(); // Gọi 1 lần duy nhất để tối ưu tốc độ đọc ghi
    
    // Tạo dòng tiêu đề nếu sheet hoàn toàn trống (lastRow == 0)
    if (lastRow === 0) {
      setupHeader(sheet);
      lastRow = 1; // Sau khi tạo dòng tiêu đề, dòng cuối cùng hiện tại là dòng 1
    }
    
    var vnTimeZone = "Asia/Ho_Chi_Minh";
    var now = new Date();
    var formattedSubmitTime = Utilities.formatDate(now, vnTimeZone, "dd/MM/yyyy HH:mm:ss");
    var todayDateString = Utilities.formatDate(now, vnTimeZone, "dd/MM/yyyy");
    
    // Sinh số thứ tự mới tự động với tham số lastRow đã tối ưu
    var queueNumber = generateQueueNumber(sheet, lastRow, todayDateString);
    
    // Lưu thông tin vào Sheet, dùng dấu nháy đơn (') để ép định dạng chữ (tránh mất số 0 ở đầu)
    sheet.appendRow([
      "'" + queueNumber,
      formattedSubmitTime,
      fullName,
      "'" + phoneNumber,
      birthDate,
      gender,
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
  var headers = [
    "Số thứ tự", 
    "Thời gian submit", 
    "Họ tên", 
    "Số điện thoại", 
    "Ngày sinh", 
    "Giới tính", 
    "CCCD", 
    "Tên công ty", 
    "Tỉnh/Thành phố", 
    "Phường/Xã", 
    "Địa chỉ chi tiết", 
    "Trạng thái xử lý"
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
}

// Hàm sinh số thứ tự, reset về 0001 mỗi ngày (Đã tối ưu hóa giảm tối đa lệnh gọi API Spreadsheet)
function generateQueueNumber(sheet, lastRow, todayStr) {
  if (lastRow <= 1) {
    return "0001";
  }
  
  // Đọc đồng thời 2 ô (cột 1 và cột 2) của dòng cuối cùng trong 1 lệnh gọi duy nhất (tiết kiệm ~300ms)
  var lastRowValues = sheet.getRange(lastRow, 1, 1, 2).getDisplayValues()[0];
  var lastQueueNumVal = lastRowValues[0];
  var lastSubmitTimeVal = lastRowValues[1];
  
  var lastDateStr = lastSubmitTimeVal ? lastSubmitTimeVal.split(" ")[0] : "";
  
  // Nếu trùng ngày thì cộng thêm 1, ngược lại reset về 0001
  if (lastDateStr === todayStr) {
    var lastNum = parseInt(lastQueueNumVal, 10);
    var nextNum = (isNaN(lastNum) ? 0 : lastNum) + 1;
    return padZero(nextNum, 4);
  } else {
    return "0001";
  }
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
