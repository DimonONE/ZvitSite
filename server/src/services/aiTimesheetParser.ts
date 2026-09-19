import Anthropic from '@anthropic-ai/sdk';
import { DayStatus } from '../models/Timesheet';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Модель з підтримкою зображень. За потреби можна замінити на іншу
// актуальну модель з https://docs.claude.com/en/docs/about-claude/models
const MODEL = 'claude-sonnet-5';

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

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
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
          { type: 'text', text: userText },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('AI did not return a text response');
  }

  // Модель іноді огортає JSON у ```json ... ``` попри інструкцію — прибираємо про всяк випадок
  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();

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
