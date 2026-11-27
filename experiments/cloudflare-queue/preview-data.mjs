export const testText = value => /thử|demo|\btest\b/i.test(value);
export const testPhone = value => /^0{8}\d{2}$/.test(value);
export const testEmail = value => /^[^\s@]+@(?:example\.(?:com|org|net)|[a-z0-9.-]+\.test)$/i.test(value);
