export interface RegistrationData {
  fullName: string;
  phoneNumber: string;
  birthDate: string;
  gender: 'Nam' | 'Nữ';
  service: string;
  branch: string;
}

export interface RegistrationResponse {
  success: boolean;
  queueNumber?: string;
  error?: string;
}
