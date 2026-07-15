import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  error?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  error = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Lấy nhãn của tùy chọn hiện tại để hiển thị trong input khi đóng
  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  // Hàm loại bỏ dấu tiếng Việt để tìm kiếm không dấu
  const removeDiacritics = (str: string) => {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  };

  // Lọc tùy chọn theo từ khóa tìm kiếm
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const cleanSearch = removeDiacritics(searchTerm);
    return options.filter((opt) =>
      removeDiacritics(opt.label).includes(cleanSearch),
    );
  }, [options, searchTerm]);

  // Click ra ngoài để đóng dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Khi người dùng tập trung vào ô nhập, mở danh sách và reset từ khóa
  const handleFocus = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearchTerm("");
  };

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          placeholder={placeholder}
          value={
            isOpen ? searchTerm : selectedOption ? selectedOption.label : ""
          }
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={handleFocus}
          className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 min-h-[38px] focus:outline-none focus:ring-2 transition-all cursor-pointer ${
            error
              ? "border-red-500 focus:ring-red-200"
              : "border-slate-200 focus:border-dym-blue-500 focus:ring-dym-blue-100"
          }`}
        />
        {/* Biểu tượng mũi tên hướng xuống */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-slate-400 pointer-events-none">
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {/* Danh sách kết quả lọc */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto py-1">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={`w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-dym-blue-50 hover:text-dym-blue-800 transition-colors ${
                  value === opt.value
                    ? "bg-dym-blue-50 text-dym-blue-800 font-semibold"
                    : ""
                }`}
              >
                {opt.label}
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-xs text-slate-400 text-center">
              {searchTerm ? "Không tìm thấy kết quả" : "Không có dữ liệu"}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
