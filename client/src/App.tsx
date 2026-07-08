import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import MobileBottomNav from './components/MobileBottomNav';
import Dashboard from './pages/Dashboard';
import CityEmployees from './pages/CityEmployees';
import EmployeeTimesheet from './pages/EmployeeTimesheet';
import EmployeeInfo from './pages/EmployeeInfo';

function App() {
  return (
    <div className="flex min-h-screen bg-background w-full">
      <Sidebar />
      <main className="flex-1 overflow-auto pb-[64px] md:pb-0" >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cities/:cityId/employees" element={<CityEmployees />} />
          <Route path="/employees/:employeeId/timesheet" element={<EmployeeTimesheet />} />
          <Route path="/employees/:employeeId" element={<EmployeeInfo />} />
        </Routes>
      </main>
      <MobileBottomNav />
    </div>
  );
}

export default App;
