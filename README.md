# Табель - Система обліку робочих днів

Веб-застосунок для бухгалтерського обліку робочих днів працівників. Користувач може створювати міста, додавати працівників, вести табель відвідування, та експортувати дані в Excel або друк.

## Технологічний стек

### Frontend
- React 18+ з TypeScript
- Tailwind CSS (адаптивний дизайн, mobile-first)
- React Router для навігації
- Axios для API запитів
- Vite як bundler

### Backend
- Node.js + Express + TypeScript
- MongoDB + Mongoose
- ExcelJS для експорту в .xlsx
- Multer для завантаження фото

## Структура проєкту

```
├── client/                 # Frontend React застосунок
│   ├── src/
│   │   ├── api/           # API клієнт
│   │   ├── components/    # React компоненти
│   │   ├── pages/         # Сторінки
│   │   ├── styles/        # CSS стилі
│   │   └── types/         # TypeScript типи
│   └── package.json
│
├── server/                # Backend Node.js застосунок
│   ├── src/
│   │   ├── controllers/   # Контролери
│   │   ├── models/        # Mongoose моделі
│   │   ├── routes/        # Express маршрути
│   │   └── utils/         # Утиліти
│   └── package.json
│
└── package.json           # Root package.json
```

## Встановлення та запуск

### Передумови
- Node.js 18+ та npm
- MongoDB (локальний або віддалений)

### Крок 1: Клонування та встановлення залежностей

```bash
# Встановлення всіх залежностей (root, client, server)
npm install
```

### Крок 2: Налаштування MongoDB

Переконайтеся, що MongoDB запущено. За замовчуванням підключення: `mongodb://localhost:27017/timesheet`

Якщо потрібно змінити URI, відредагуйте `server/.env`:

```env
MONGODB_URI=mongodb://localhost:27017/timesheet
PORT=5000
UPLOAD_DIR=./uploads
```

### Крок 3: Запуск проєкту

```bash
# Запуск frontend та backend одночасно
npm run dev
```

Або окремо:

```bash
# Тільки backend (порт 5000)
npm run dev:server

# Тільки frontend (порт 3000)
npm run dev:client
```

### Крок 4: Відкрийте в браузері

```
http://localhost:3000
```

## Основний функціонал

### 1. Управління містами
- Створення міст
- Перегляд списку міст
- Редагування/видалення міст

### 2. Управління працівниками
- Додавання працівників до міста
- Завантаження фото працівника
- Переміщення працівників між містами
- Видалення працівників

### 3. Табель відвідування
- Перегляд табеля по місяцях
- Зміна статусу дня (робочий, вихідний, відгул, лікарняний, відпустка)
- Автоматичне визначення вихідних (субота/неділя)
- Зелене виділення вихідних днів

### 4. Експорт та друк
- Експорт табеля в Excel (.xlsx) з форматуванням
- Друк табеля (альбомна орієнтація A4)
- Прев'ю перед друком/експортом

## API Endpoints

### Cities
- `GET /api/cities` - отримати всі міста
- `POST /api/cities` - створити місто
- `PATCH /api/cities/:id` - оновити місто
- `DELETE /api/cities/:id` - видалити місто

### Employees
- `GET /api/cities/:cityId/employees` - отримати працівників міста
- `POST /api/employees` - створити працівника
- `PATCH /api/employees/:id` - оновити працівника
- `DELETE /api/employees/:id` - видалити працівника
- `POST /api/employees/:id/photo` - завантажити фото

### Timesheets
- `GET /api/employees/:employeeId/timesheets/:year/:month` - отримати табель
- `PUT /api/employees/:employeeId/timesheets/:year/:month` - оновити табель
- `GET /api/employees/:employeeId/timesheets/:year/:month/export` - експортувати в Excel

## Особливості UI/UX

- **Mobile-first дизайн**: оптимізовано для телефонів
- Великі області натискання (мін. 44px висота)
- Вертикальний список днів для зручного тапу
- Зелене виділення вихідних
- Швидкий доступ: 2-3 тапи до табеля працівника

## Production Build

```bash
# Build frontend та backend
npm run build

# Запуск production сервера
npm start
```

## Ліцензія

ISC

## Автор

Розроблено згідно ТЗ для системи обліку робочих днів працівників
