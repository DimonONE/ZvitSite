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

const ALLOWED_STATUSES: DayStatus[] = ['worked', 'weekend', 'dayoff', 'sick', 'vacation', 'unknown'];

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

  const systemPrompt = `
Ты — OCR-система для распознавания бумажного табеля учета рабочего времени.

ТВОЯ ГЛАВНАЯ ЗАДАЧА:
точно прочитать визуальное содержимое ячеек выбранной строки.
НЕ ДОГАДЫВАЙСЯ о содержимом ячейки.

На изображении есть таблица:
- слева находится имя сотрудника;
- далее идут столбцы дней месяца 1..${totalDays};
- в каждой ячейке дня может быть:
  1. рукописная запись с количеством часов;
  2. красный крест X;
  3. полностью пустая ячейка;
  4. неразборчивая/сомнительная запись.

ВАЖНО:
Красный крест X — это НЕ число и НЕ часы.
Пустая ячейка — это НЕ число и НЕ часы.
Не превращай крестики, линии таблицы или части соседних ячеек в цифры.

ПРАВИЛА РАСПОЗНАВАНИЯ:

1. Сначала найди строку сотрудника "${employeeFullName ?? 'указанного сотрудника'}".

2. Работай ТОЛЬКО с этой строкой.
Не используй записи из строк других сотрудников.

3. Для каждого дня ${Array.from({length: totalDays}, (_, i) => i + 1).join(', ')}
определи визуальное состояние ячейки.

4. Если внутри ячейки явно виден красный крест X:
   - status = "dayoff"
   - hours = null
   - НИКОГДА не интерпретируй X как цифры.

5. Если ячейка полностью пустая:
   - status = "unknown"
   - hours = null

6. Если внутри ячейки есть рукописная запись с часами:
   - status = "worked"
   - hours = число, которое реально написано в этой ячейке.

7. Если запись невозможно уверенно прочитать:
   - status = "unknown"
   - hours = null

8. НЕ ВОССТАНАВЛИВАЙ пропущенные значения по соседним дням.
9. НЕ ПРЕДПОЛАГАЙ стандартный график Пн-Пт.
10. НЕ ПОДСТАВЛЯЙ часы из соседней ячейки.
11. НЕ КОПИРУЙ значение из другой строки.
12. НЕ ИСПОЛЬЗУЙ итоговую сумму справа для восстановления отдельных дней.
13. НЕ ИСПОЛЬЗУЙ итоговую сумму внизу для восстановления отдельных дней.

ОЧЕНЬ ВАЖНО:
Каждый день должен быть прочитан независимо.
Если ты не уверен — лучше вернуть unknown/null, чем придумать значение.

Верни РОВНО ${totalDays} объектов — по одному для каждого дня от 1 до ${totalDays}.

Формат:
[
  {
    "day": 1,
    "status": "worked",
    "hours": 11.5
  },
  {
    "day": 2,
    "status": "dayoff",
    "hours": null
  },
  {
    "day": 3,
    "status": "unknown",
    "hours": null
  }
]

Никакого текста вне JSON.
`;

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
