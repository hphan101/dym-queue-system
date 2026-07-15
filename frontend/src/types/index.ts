export interface RegistrationData {
  fullName: string;
  phoneNumber: string;
  birthDate: string;
  gender: 'Nam' | 'Nữ';
  cccd: string;
  province: string;
  ward: string;
  addressDetail: string;
  companyName: string;
  service: string;
  branch: string;
}

export interface RegistrationResponse {
  success: boolean;
  queueNumber?: string;
  error?: string;
}
