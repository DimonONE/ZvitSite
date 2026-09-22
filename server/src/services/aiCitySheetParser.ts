import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-5';

export interface ParsedCitySheetEmployee {
  name: string;
  // hours[i] = кількість годин у день (i+1); null = "x" / порожньо / нерозбірливо
  hours: (number | null)[];
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
- В кінці рядка іноді є підсумкова колонка з сумою годин — її НЕ повертай, вона рахується окремо.

Поверни ТІЛЬКИ валідний JSON (без markdown, без пояснень) такого виду:
{
  "cityName": "Moskevska 49",
  "year": 2026,
  "month": 8,
  "employees": [
    { "name": "Ivan Savula", "hours": [11.5, null, 11.5, ...] },
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

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64Image,
            },
          },
          { type: 'text', text: 'Розпізнай цей табель за інструкцією.' },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('AI did not return a text response');
  }

  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();

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
      return { name: String(e.name).trim(), hours };
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
