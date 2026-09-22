import { Link, useLocation } from 'react-router-dom';
import { Home, Download } from 'lucide-react';

const mainItems = [
  { path: '/', label: 'Дашборд', icon: Home },
  { path: '/export', label: 'Експорт', icon: Download },
];

const MobileBottomNav = () => {
  const location = useLocation();

  return (
    <nav className="fixed left-0 right-0 bottom-0 z-30 bg-white border-t border-[#e5e8ed] flex items-stretch h-[64px] md:hidden">
      {mainItems.map((item) => {
        const isActive = location.pathname === item.path;
        const Icon = item.icon;
        return (
          <Link
            key={item.path}
            to={item.path}
            className="flex-1 flex flex-col items-center justify-center gap-1"
          >
            <Icon
              className={`w-5 h-5 ${isActive ? 'text-[#21ba6b]' : 'text-[#9aa1ab]'}`}
            />
            <span
              className={`text-[11px] ${
                isActive ? 'font-semibold text-[#21ba6b]' : 'font-medium text-[#737a85]'
              }`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};

export default MobileBottomNav;