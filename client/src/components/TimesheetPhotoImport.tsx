import { useRef, useState } from 'react';
import { importTimesheetPhoto } from '../api';
import { Timesheet } from '../types';

interface TimesheetPhotoImportProps {
  employeeId: string;
  year: number;
  month: number;
  onImported: (timesheet: Timesheet) => void;
}

// Кнопка "Завантажити фото табеля": відкриває камеру/галерею телефону,
// відправляє фото на сервер (там воно розпізнається через AI) і одразу
// підставляє розпізнані дні у форму. Дані вже збережені в MongoDB на
// цей момент — форма просто відображає актуальний стан.
const TimesheetPhotoImport = ({ employeeId, year, month, onImported }: TimesheetPhotoImportProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Оберіть, будь ласка, зображення');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const response = await importTimesheetPhoto(employeeId, year, month, file);
      onImported(response.data);
    } catch (err) {
      console.error('Failed to import timesheet photo:', err);
      setError('Не вдалося розпізнати фото. Перевірте якість знімку і спробуйте ще раз.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="bg-white border border-[#e5e8ed] h-11 flex items-center justify-center gap-2 rounded-lg text-[#1c2126] text-sm font-semibold disabled:opacity-60"
      >
        <span>{uploading ? '⏳' : '📷'}</span>
        {uploading ? 'Розпізнаємо фото...' : 'Завантажити фото табеля'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        disabled={uploading}
      />
      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
};

export default TimesheetPhotoImport;
