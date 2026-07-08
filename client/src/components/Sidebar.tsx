import { Link, useLocation } from 'react-router-dom';

const Sidebar = () => {
  const location = useLocation();

  const menuItems = [
    { path: '/', label: 'Дашборд' },
    { path: '/employees', label: 'Працівники' },
    { path: '/cities', label: 'Міста' },
    { path: '/calendar', label: 'Календар' },
    { path: '/export', label: 'Експорт' },
    { path: '/settings', label: 'Налаштування' },
  ];

  return (
    <aside className="hidden md:flex w-60 h-full bg-white border-r border-[#e5e8ed] flex-col gap-1 pt-6 px-5">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0 mb-5">
        <div className="w-7 h-7 bg-[#21ba6b] rounded-lg shrink-0" />
        <span className="text-[16px] font-bold text-[#1c2126] whitespace-nowrap">
          S.R.O. Monostav
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2.5 h-10 px-3 rounded-lg transition-colors ${
                isActive ? 'bg-[#e5f7eb]' : 'hover:bg-gray-50'
              }`}
            >
              <span
                className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                  isActive ? 'bg-[#21ba6b]' : 'bg-[#d9dee5]'
                }`}
              />
              <span
                className={`text-[14px] whitespace-nowrap ${
                  isActive
                    ? 'font-semibold text-[#21ba6b]'
                    : 'font-medium text-[#737a85]'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Spacer pushes user block to bottom */}
      <div className="flex-1" />

      {/* User section */}
      <div className="flex items-center gap-2.5 h-14 pb-6 shrink-0">
        <div className="w-9 h-9 rounded-full bg-[#e5f7eb] flex items-center justify-center shrink-0 text-[13px] font-semibold text-[#21ba6b]">
          ІП
        </div>
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
          <span className="text-[13px] font-semibold text-[#1c2126]">
            Іван Петренко
          </span>
          <span className="text-[12px] font-normal text-[#737a85]">
            Адміністратор
          </span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;