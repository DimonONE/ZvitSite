import { useState } from 'react';
import { uploadEmployeePhoto } from '../api';

interface PhotoUploadProps {
  employeeId: string;
  currentPhotoUrl: string | null;
  onPhotoUpdated: (photoUrl: string) => void;
}

const PhotoUpload = ({ employeeId, currentPhotoUrl, onPhotoUpdated }: PhotoUploadProps) => {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Валідація
    if (!file.type.startsWith('image/')) {
      alert('Будь ласка, оберіть зображення');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Розмір файлу не повинен перевищувати 5 МБ');
      return;
    }

    setUploading(true);
    try {
      const response = await uploadEmployeePhoto(employeeId, file);
      onPhotoUpdated(response.data.photoUrl);
    } catch (error) {
      console.error('Failed to upload photo:', error);
      alert('Помилка завантаження фото');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative inline-block">
      <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center text-3xl overflow-hidden">
        {currentPhotoUrl ? (
          <img
            src={currentPhotoUrl}
            alt="Employee"
            className="w-full h-full object-cover"
          />
        ) : (
          '👤'
        )}
      </div>
      <label
        htmlFor={`photo-upload-${employeeId}`}
        className="absolute bottom-0 right-0 bg-primary text-white rounded-full p-2 cursor-pointer hover:bg-green-600 transition-colors"
      >
        {uploading ? '⏳' : '📷'}
        <input
          id={`photo-upload-${employeeId}`}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />
      </label>
    </div>
  );
};

export default PhotoUpload;
