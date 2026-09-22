import { GoogleGenAI } from '@google/genai';
import { DayStatus } from '../models/Timesheet';

let geminiClient: GoogleGenAI | null = null;
const getGeminiClient = () => {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
};

const MODEL = 'gemini-3.5-flash-lite';

export interface ParsedDay {
  day: number;
  status: DayStatus;
  hours: number | null;
}

const ALLOWED_STATUSES: DayStatus[] = ['worked', 'weekend', 'dayoff', 'sick', 'vacation'];

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/**
 * Надсилає фото паперового табеля в Claude і повертає розпізнані дні.
 * Кидає помилку, якщо фото не вдалося розпізнати або відповідь некоректна.
 */
export const parseTimesheetPhoto = async (
  imageBuffer: Buffer,
  mimeType: string,
  year: number,
  month: number,
  employeeFullName?: string
): Promise<ParsedDay[]> => {
  const totalDays = daysInMonth(year, month);
  const base64Image = imageBuffer.toString('base64');

  const systemPrompt = `Ти розпізнаєш фото паперового табеля обліку робочого часу (рукописного або друкованого).
Тобі дано фото та потрібно повернути ТІЛЬКИ валідний JSON-масив (без жодного тексту навколо, без markdown) виду:
[{"day": 1, "status": "worked", "hours": 8}, {"day": 2, "status": "weekend", "hours": null}, ...]

Правила:
- "day" — номер дня місяця (1..${totalDays}).
- "status" — одне з: "worked" (робочий день), "weekend" (вихідний), "dayoff" (відгул), "sick" (лікарняний), "vacation" (відпустка).
- "hours" — кількість відпрацьованих годин числом, або null якщо не застосовується (вихідний, лікарняний тощо) або нерозбірливо.
- Поверни рядок для КОЖНОГО дня місяця від 1 до ${totalDays}, навіть якщо в документі даних по ньому немає (постав "worked" з hours null у такому разі і постав в кінці свого internal reasoning нічого — тільки масив у відповіді).
- Якщо почерк нерозбірливий для конкретного дня, став найбільш вірогідне значення, орієнтуючись на сусідні дні та стандартний робочий графік (Пн-Пт робочі, Сб-Нд вихідні).`;

  const userText = employeeFullName
    ? `Розпізнай табель для працівника "${employeeFullName}" за ${month}/${year}.`
    : `Розпізнай табель за ${month}/${year}.`;

  const response = await getGeminiClient().models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: userText },
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
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error('AI did not return a text response');
  }

  // Про всяк випадок прибираємо можливе огортання в ```json ... ```
  const cleaned = responseText.replace(/```json|```/g, '').trim();

  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('Failed to parse AI response as JSON');
  }

  if (!Array.isArray(raw)) {
    throw new Error('AI response is not an array');
  }

  const parsedDays: ParsedDay[] = raw
    .filter((item): item is { day: unknown; status: unknown; hours: unknown } =>
      typeof item === 'object' && item !== null
    )
    .map((item) => {
      const day = Number(item.day);
      const status = ALLOWED_STATUSES.includes(item.status as DayStatus)
        ? (item.status as DayStatus)
        : 'worked';
      const hours =
        item.hours === null || item.hours === undefined || Number.isNaN(Number(item.hours))
          ? null
          : Number(item.hours);
      return { day, status, hours };
    })
    .filter((d) => d.day >= 1 && d.day <= totalDays);

  if (parsedDays.length === 0) {
    throw new Error('AI response did not contain any valid days');
  }

  return parsedDays;
};
