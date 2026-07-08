import { useState } from 'react';
import { updateEmployee } from '../api';
import { Employee, City } from '../types';

interface MoveEmployeeModalProps {
  employee: Employee;
  cities: City[];
  onClose: () => void;
  onMoved: () => void;
}

const MoveEmployeeModal = ({ employee, cities, onClose, onMoved }: MoveEmployeeModalProps) => {
  const [selectedCityId, setSelectedCityId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleMove = async () => {
    if (!selectedCityId) return;

    setLoading(true);
    try {
      await updateEmployee(employee._id, { cityId: selectedCityId });
      onMoved();
      onClose();
    } catch (error) {
      console.error('Failed to move employee:', error);
      alert('Помилка переміщення працівника');
    } finally {
      setLoading(false);
    }
  };

  const availableCities = cities.filter(city => city._id !== employee.cityId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-semibold mb-4">Перемістити працівника</h2>
        <p className="text-gray-600 mb-4">
          Переміщення: <strong>{employee.fullName}</strong>
        </p>

        <select
          value={selectedCityId}
          onChange={(e) => setSelectedCityId(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary mb-4"
          disabled={loading}
        >
          <option value="">Оберіть місто</option>
          {availableCities.map((city) => (
            <option key={city._id} value={city._id}>
              {city.name}
            </option>
          ))}
        </select>

        <div className="flex gap-3">
          <button
            onClick={handleMove}
            disabled={!selectedCityId || loading}
            className="flex-1 bg-primary text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Переміщення...' : 'Перемістити'}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition-colors"
          >
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoveEmployeeModal;
