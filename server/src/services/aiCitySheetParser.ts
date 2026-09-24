import { GoogleGenAI } from '@google/genai';

let geminiClient: GoogleGenAI | null = null;
const getGeminiClient = () => {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
};

// gemini-3.5-flash-lite має найщедріший безкоштовний ліміт (сотні запитів
// на добу) — для "пари фото на день" вистачає з великим запасом.
// Модель можна підмінити через GEMINI_MODEL у .env (для щільних рукописних
// таблиць «lite»-модель частіше плутає «x» і числа — спробуйте потужнішу).
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

export interface ParsedCitySheetEmployee {
  name: string;
  // hours[i] = кількість годин у день (i+1); null = "x" / порожньо / нерозбірливо
  hours: (number | null)[];
  // Підсумок із останньої колонки фото («Hod. celkem»), якщо він є. Використовується
  // ЛИШЕ для перевірки: сума розпізнаних днів має збігатися з ним.
  total: number | null;
}

export interface ParsedCitySheet {
  cityName: string | null;
  year: number | null;
  month: number | null;
  employees: ParsedCitySheetEmployee[];
}

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/**
 * Розпізнає фото зведеного табеля по місту: перший рядок — номери днів (1..31),
 * зліва — прізвища працівників, у клітинках — кількість годин або "x".
 */
export const parseCitySheetPhoto = async (
  imageBuffer: Buffer,
  mimeType: string
): Promise<ParsedCitySheet> => {
  const base64Image = imageBuffer.toString('base64');

  const systemPrompt = `Ти розпізнаєш фото паперового зведеного табеля обліку робочого часу по об'єкту/місту.
Структура документа:
- У шапці зазвичай написано назву місця/міста (може бути підписано як "місто:", "місце:", "místo:" або просто написано від руки) і дату початку місяця (може бути підписана як "дата:", "nástup:" або просто число).
- Далі йде таблиця: перший рядок — номери днів місяця (1, 2, 3 ... 30/31).
- Кожен наступний рядок — один працівник: у першій колонці прізвище/ім'я (як написано, навіть скорочено), а в колонках днів — або число (кількість відпрацьованих годин, може бути з десятковою частиною, наприклад 11.5), або літера "x"/"х" (день не відпрацьований), або клітинка може бути порожньою чи нерозбірливою.
- В кінці рядка зазвичай є підсумкова колонка з сумою годин («Hod. celkem» / «Всього»). Повертай її окремим числом у полі "total" (тільки для перевірки; НЕ вписуй її в масив "hours"). Якщо колонки немає або число нерозбірливе — null.

Поверни ТІЛЬКИ валідний JSON (без markdown, без пояснень) такого виду:
{
  "cityName": "Moskevska 49",
  "year": 2026,
  "month": 8,
  "employees": [
    { "name": "Ivan Savula", "hours": [11.5, null, 11.5, ...], "total": 294.5 },
    ...
  ]
}

Правила:
- "cityName" — назва місця/міста з шапки документа, як написано. Якщо не зміг розпізнати — null.
- "year" і "month" — визнач з дати в шапці документа. Якщо дати немає або не зміг розпізнати — постав null для обох.
- Кожен масив "hours" повинен мати РІВНО стільки елементів, скільки днів у розпізнаному місяці (28-31). Якщо місяць не розпізнано — постав 31 елемент.
- Елемент масиву — число годин (наприклад 11.5, 10, 9, 4) якщо в клітинці написано число; null якщо там "x"/"х", порожньо, або нерозбірливо.
- Розпізнай КОЖНОГО працівника з таблиці, збережи порядок рядків як у документі.
- Не вигадуй працівників чи значення — якщо клітинка нерозбірлива, став null.`;

  const response = await getGeminiClient().models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Розпізнай цей табель за інструкцією.' },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image,
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      temperature: 0,
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error('AI did not return a text response');
  }

  const cleaned = responseText.replace(/```json|```/g, '').trim();

  let raw: any;
  try {
    raw = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('Failed to parse AI response as JSON');
  }

  if (!raw || !Array.isArray(raw.employees)) {
    throw new Error('AI response has unexpected shape');
  }

  const year: number | null = Number.isInteger(raw.year) ? raw.year : null;
  const month: number | null =
    Number.isInteger(raw.month) && raw.month >= 1 && raw.month <= 12 ? raw.month : null;
  const totalDays = year && month ? daysInMonth(year, month) : 31;

  const employees: ParsedCitySheetEmployee[] = raw.employees
    .filter((e: any) => e && typeof e.name === 'string' && e.name.trim().length > 0)
    .map((e: any) => {
      const rawHours: any[] = Array.isArray(e.hours) ? e.hours : [];
      const hours: (number | null)[] = [];
      for (let i = 0; i < totalDays; i++) {
        const v = rawHours[i];
        const num = Number(v);
        hours.push(v === null || v === undefined || Number.isNaN(num) ? null : num);
      }
      const totalNum = e.total === null || e.total === undefined || e.total === '' ? NaN : Number(e.total);
      return {
        name: String(e.name).trim(),
        hours,
        total: Number.isFinite(totalNum) ? totalNum : null,
      };
    });

  if (employees.length === 0) {
    throw new Error('AI response did not contain any employees');
  }

  return {
    cityName: typeof raw.cityName === 'string' && raw.cityName.trim() ? raw.cityName.trim() : null,
    year,
    month,
    employees,
  };
};
