import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, Building2, MoreHorizontal, Calendar, Download, Settings, X } from 'lucide-react';

const mainItems = [
  { path: '/', label: 'Дашборд', icon: Home },
  { path: '/employees', label: 'Працівники', icon: Users },
  { path: '/cities', label: 'Міста', icon: Building2 },
];

const moreItems = [
  { path: '/calendar', label: 'Календар', icon: Calendar },
  { path: '/export', label: 'Експорт', icon: Download },
  { path: '/settings', label: 'Налаштування', icon: Settings },
];

const MobileBottomNav = () => {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreItems.some((item) => item.path === location.pathname);

  return (
    <>
      {/* Backdrop + sheet for "Ще" */}
      {moreOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}
      <div
        className={`fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-2xl border-t border-[#e5e8ed] px-5 pt-4 pb-6 transition-transform duration-200 md:hidden ${
          moreOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-[15px] font-semibold text-[#1c2126]">Ще</span>
          <button onClick={() => setMoreOpen(false)}>
            <X className="w-5 h-5 text-[#737a85]" />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {moreItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3 h-11 px-3 rounded-lg ${
                  isActive ? 'bg-[#e5f7eb]' : 'hover:bg-gray-50'
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${isActive ? 'text-[#21ba6b]' : 'text-[#737a85]'}`}
                />
                <span
                  className={`text-[14px] ${
                    isActive ? 'font-semibold text-[#21ba6b]' : 'font-medium text-[#737a85]'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom tab bar */}
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

        <button
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1"
        >
          <MoreHorizontal
            className={`w-5 h-5 ${isMoreActive ? 'text-[#21ba6b]' : 'text-[#9aa1ab]'}`}
          />
          <span
            className={`text-[11px] ${
              isMoreActive ? 'font-semibold text-[#21ba6b]' : 'font-medium text-[#737a85]'
            }`}
          >
            Ще
          </span>
        </button>
      </nav>
    </>
  );
};

export default MobileBottomNav;