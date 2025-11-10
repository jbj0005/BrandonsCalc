export const formatPhoneNumber = (value: string): string => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
};

export const formatCurrencyInput = (value: string): string => {
  if (!value) return '';
  const cleaned = value.replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const [integerPartRaw, decimalRaw] = cleaned.split('.');
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, '') || '0';
  const formattedInt = Number(integerPart).toLocaleString();
  const cents =
    decimalRaw !== undefined ? decimalRaw.replace(/\D/g, '').slice(0, 2) : '';
  const base = cents ? `${formattedInt}.${cents}` : formattedInt;
  return `$${base}`;
};

export const formatCurrencyValue = (
  value: number | string | null | undefined
): string => {
  if (value == null || isNaN(Number(value))) return '';
  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};
