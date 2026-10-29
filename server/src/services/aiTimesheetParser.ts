import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { DayStatus } from '../models/Timesheet';

let geminiClient: GoogleGenAI | null = null;

const getGeminiClient = () => {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
};

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

type CellType = 'written' | 'cross' | 'empty' | 'uncertain' | 'special';

type Rotation = 0 | 90 | -90 | 180;

interface RowLocator {
  rotation: Rotation;
  region: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  confidence: number;
}

interface OcrCell {
  day: number;
  cellType: CellType;
  hours: number | null;
  statusHint: DayStatus | null;
  confidence: number;
  rawText: string | null;
}

interface OcrSegmentResult {
  cells: OcrCell[];
  printedTotal: number | null;
}

export interface ParsedDay {
  day: number;
  status: DayStatus;
  hours: number | null;
}

const ALLOWED_STATUSES: DayStatus[] = [
  'worked',
  'weekend',
  'dayoff',
  'sick',
  'vacation',
];

const daysInMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

const DEFAULT_SEGMENTS = [
  { start: 0.00, end: 0.46 },
  { start: 0.27, end: 0.73 },
  { start: 0.54, end: 1.00 },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const cleanJson = (text: string) =>
  text.replace(/```json|```/g, '').trim();

const parseJson = <T>(text: string): T => {
  try {
    return JSON.parse(cleanJson(text)) as T;
  } catch {
    throw new Error('Failed to parse AI response as JSON');
  }
};

const normalizeInputImage = async (imageBuffer: Buffer): Promise<Buffer> => {
  // First honor EXIF orientation. This makes the coordinates returned by the
  // locator correspond to the image we subsequently crop.
  return sharp(imageBuffer)
    .rotate()
    .jpeg({ quality: 92 })
    .toBuffer();
};

const locateEmployeeRow = async (
  imageBuffer: Buffer,
  employeeFullName: string,
): Promise<RowLocator> => {
  const base64Image = imageBuffer.toString('base64');

  const prompt = `
You are a visual document-layout locator.

The image is a photographed paper timesheet. Find the table row belonging to this
employee:

"${employeeFullName}"

The image may be rotated sideways. Do NOT assume the image orientation.

Return ONLY JSON:
{
  "rotation": 0 | 90 | -90 | 180,
  "region": {
    "left": number,
    "top": number,
    "right": number,
    "bottom": number
  },
  "confidence": number
}

Coordinates must be normalized to 0..1000 and refer to the image EXACTLY AS
UPLOADED, before applying "rotation".

"rotation" is the clockwise rotation that should be applied to the cropped
region to make the table upright and readable.

The "region" must be the smallest practical axis-aligned rectangle in the
uploaded image that contains:
- the day-number header row (1..28/29/30/31), and
- the COMPLETE row of "${employeeFullName}".

It should contain no other employee's complete row if possible.

IMPORTANT:
- Do not return the coordinates of a similarly named employee.
- Do not include the whole page unless you genuinely cannot locate the row.
- Do not infer row position from standard table layout; inspect the image.
- Confidence must be below 0.6 if the employee row is ambiguous.
`;

  const response = await getGeminiClient().models.generateContent({
    model: MODEL,
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
          },
        },
      ],
    }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0,
    },
  });

  if (!response.text) {
    throw new Error('AI did not return row locator response');
  }

  const raw = parseJson<Partial<RowLocator>>(response.text);

  const rotation =
    raw.rotation === 90 ||
    raw.rotation === -90 ||
    raw.rotation === 180 ||
    raw.rotation === 0
      ? raw.rotation
      : 0;

  const region = raw.region;

  if (
    !region ||
    !Number.isFinite(region.left) ||
    !Number.isFinite(region.top) ||
    !Number.isFinite(region.right) ||
    !Number.isFinite(region.bottom)
  ) {
    throw new Error('AI returned invalid employee row coordinates');
  }

  const confidence = Number.isFinite(raw.confidence)
    ? clamp(Number(raw.confidence), 0, 1)
    : 0;

  if (confidence < 0.6) {
    throw new Error(
      `Could not confidently locate employee row "${employeeFullName}"`,
    );
  }

  if (
    region.left < 0 ||
    region.top < 0 ||
    region.right > 1000 ||
    region.bottom > 1000 ||
    region.right <= region.left ||
    region.bottom <= region.top
  ) {
    throw new Error('AI returned out-of-range employee row coordinates');
  }

  return { rotation, region, confidence };
};

const cropEmployeeRow = async (
  normalizedImage: Buffer,
  locator: RowLocator,
): Promise<Buffer> => {
  const metadata = await sharp(normalizedImage).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not determine image dimensions');
  }

  const paddingX = 12;
  const paddingY = 12;

  const left = clamp(
    Math.floor((locator.region.left / 1000) * metadata.width) - paddingX,
    0,
    metadata.width - 1,
  );

  const top = clamp(
    Math.floor((locator.region.top / 1000) * metadata.height) - paddingY,
    0,
    metadata.height - 1,
  );

  const right = clamp(
    Math.ceil((locator.region.right / 1000) * metadata.width) + paddingX,
    left + 1,
    metadata.width,
  );

  const bottom = clamp(
    Math.ceil((locator.region.bottom / 1000) * metadata.height) + paddingY,
    top + 1,
    metadata.height,
  );

  const width = right - left;
  const height = bottom - top;

  // Crop first, then rotate. For a sideways photographed table this keeps the
  // selected row tight instead of rotating the whole page.
  return sharp(normalizedImage)
    .extract({ left, top, width, height })
    .rotate(locator.rotation)
    .resize({ width: 6000, withoutEnlargement: false })
    .jpeg({ quality: 92 })
    .toBuffer();
};

const parseSegment = async (
  segmentBuffer: Buffer,
  totalDays: number,
  employeeFullName: string,
): Promise<OcrSegmentResult> => {
  const base64Image = segmentBuffer.toString('base64');

  const systemPrompt = `
You are an OCR engine for ONE employee row of a paper timesheet.

Target employee:
"${employeeFullName}"

The image contains the day-number header and one employee row, possibly with
only a portion of the month visible. Other parts of the table may also be
visible at the left/right edge.

Return ONLY JSON:
{
  "cells": [
    {
      "day": 1,
      "cellType": "written" | "cross" | "empty" | "uncertain" | "special",
      "hours": 11.5,
      "statusHint": null,
      "confidence": 0.98,
      "rawText": "11.5"
    }
  ],
  "printedTotal": null
}

CRITICAL RULES:

1. Read ONLY the target employee row.
   Never copy values from another employee row.

2. Use the printed day number at the TOP of each column to determine "day".
   Return only days whose day-number header is actually visible in this image.

3. Every cell must be classified visually:
   - "written": there is an actual handwritten numeric hours value.
   - "cross": the cell contains the red X/cross marking.
   - "empty": the cell is genuinely blank.
   - "uncertain": there is content but you cannot read/classify it reliably.
   - "special": an explicit non-hour status mark is visibly written in the cell.

4. A red X is NOT a number.
   Never turn an X into 1, 11, 11.5, 15, 10, etc.

5. Table borders, grid lines, neighboring handwriting, and the total column
   are NOT cell contents.

6. If a numeric value is not clearly visible, use:
   cellType = "uncertain", hours = null
   rather than guessing.

7. Do NOT infer a value from neighboring days.
   Do NOT infer a value from the weekday/weekend schedule.
   Do NOT copy a repeated value because surrounding cells have the same value.

8. For "written", "hours" must be the number visibly written in that exact cell.
   Typical values can include decimals such as 11.5.

9. For "cross", "empty", "uncertain", and "special", hours MUST be null.

10. "statusHint" may be:
    "worked", "weekend", "dayoff", "sick", or "vacation",
    but ONLY when that status is explicitly visible in the cell.
    Otherwise it MUST be null.

11. "rawText" is the literal visible text if readable, otherwise null.

12. confidence is your confidence in THIS CELL ONLY, not confidence in
    neighboring cells.

13. "printedTotal" is the handwritten/printed total-hours value from the final
    "Hod. celkem"/"Всього" column ONLY if that total column is visible in this
    crop. Otherwise null.

14. There must be no fabricated cells outside the visible day headers.

The month has ${totalDays} days.
`;

  const response = await getGeminiClient().models.generateContent({
    model: MODEL,
    contents: [{
      role: 'user',
      parts: [
        {
          text: `Read the visible day cells for "${employeeFullName}". Do not guess.`,
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
          },
        },
      ],
    }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      temperature: 0,
    },
  });

  if (!response.text) {
    throw new Error('AI did not return OCR segment response');
  }

  const raw = parseJson<{
    cells?: unknown;
    printedTotal?: unknown;
  }>(response.text);

  const rawCells = Array.isArray(raw.cells) ? raw.cells : [];

  const cells: OcrCell[] = rawCells
    .filter((item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null,
    )
    .map((item) => {
      const day = Number(item.day);
      const cellType = item.cellType;

      const validCellType: CellType =
        cellType === 'written' ||
        cellType === 'cross' ||
        cellType === 'empty' ||
        cellType === 'uncertain' ||
        cellType === 'special'
          ? cellType
          : 'uncertain';

      const numericHours =
        item.hours === null ||
        item.hours === undefined ||
        item.hours === ''
          ? null
          : Number(item.hours);

      const hours =
        validCellType === 'written' &&
        numericHours !== null &&
        Number.isFinite(numericHours) &&
        numericHours >= 0 &&
        numericHours <= 24
          ? numericHours
          : null;

      const statusHint =
        ALLOWED_STATUSES.includes(item.statusHint as DayStatus)
          ? (item.statusHint as DayStatus)
          : null;

      const confidence = Number.isFinite(Number(item.confidence))
        ? clamp(Number(item.confidence), 0, 1)
        : 0;

      return {
        day,
        cellType: validCellType,
        hours,
        statusHint,
        confidence,
        rawText:
          typeof item.rawText === 'string' && item.rawText.trim()
            ? item.rawText.trim()
            : null,
      };
    })
    .filter(
      (cell) =>
        Number.isInteger(cell.day) &&
        cell.day >= 1 &&
        cell.day <= totalDays,
    );

  const printedTotal =
    raw.printedTotal === null ||
    raw.printedTotal === undefined ||
    raw.printedTotal === ''
      ? null
      : Number(raw.printedTotal);

  return {
    cells,
    printedTotal:
      printedTotal !== null && Number.isFinite(printedTotal) && printedTotal >= 0
        ? printedTotal
        : null,
  };
};

const makeSegments = async (rowImage: Buffer): Promise<Buffer[]> => {
  const metadata = await sharp(rowImage).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not determine cropped row dimensions');
  }

  return Promise.all(
    DEFAULT_SEGMENTS.map(async ({ start, end }) => {
      const left = Math.floor(metadata.width! * start);
      const right = Math.ceil(metadata.width! * end);

      return sharp(rowImage)
        .extract({
          left,
          top: 0,
          width: Math.max(1, right - left),
          height: metadata.height!,
        })
        .resize({ width: 3200, withoutEnlargement: false })
        .jpeg({ quality: 92 })
        .toBuffer();
    }),
  );
};

const cellSignature = (cell: OcrCell): string =>
  JSON.stringify({
    cellType: cell.cellType,
    hours: cell.hours,
    statusHint: cell.statusHint,
  });

const chooseCell = (candidates: OcrCell[]): OcrCell => {
  if (candidates.length === 1) {
    return candidates[0];
  }

  const groups = new Map<string, OcrCell[]>();

  for (const candidate of candidates) {
    const signature = cellSignature(candidate);
    const group = groups.get(signature) ?? [];
    group.push(candidate);
    groups.set(signature, group);
  }

  const ranked = [...groups.values()].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;

    const aConfidence =
      a.reduce((sum, cell) => sum + cell.confidence, 0) / a.length;
    const bConfidence =
      b.reduce((sum, cell) => sum + cell.confidence, 0) / b.length;

    return bConfidence - aConfidence;
  });

  // If two independent crops agree, trust the agreement.
  if (ranked.length === 1 || ranked[0].length >= 2) {
    return ranked[0].reduce((best, current) =>
      current.confidence > best.confidence ? current : best,
    );
  }

  // Conflicting OCR results are deliberately NOT resolved by guessing.
  return {
    day: candidates[0].day,
    cellType: 'uncertain',
    hours: null,
    statusHint: null,
    confidence: 0,
    rawText: null,
  };
};

const defaultStatusForDay = (
  year: number,
  month: number,
  day: number,
): DayStatus => {
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6 ? 'weekend' : 'worked';
};

/**
 * Recognizes one employee row from a photographed paper timesheet.
 *
 * Pipeline:
 * 1. Normalize EXIF orientation.
 * 2. Gemini locates the exact employee row.
 * 3. Only the header + target row is cropped.
 * 4. The crop is split into 3 overlapping enlarged segments.
 * 5. Gemini OCRs each segment independently.
 * 6. Overlapping results are merged by agreement; conflicts become uncertain.
 *
 * The function intentionally never invents missing hours.
 */
export const parseTimesheetPhoto = async (
  imageBuffer: Buffer,
  _mimeType: string,
  year: number,
  month: number,
  employeeFullName?: string,
): Promise<ParsedDay[]> => {
  const totalDays = daysInMonth(year, month);

  if (!employeeFullName?.trim()) {
    throw new Error('Employee full name is required for photo OCR');
  }

  const normalizedImage = await normalizeInputImage(imageBuffer);

  const locator = await locateEmployeeRow(
    normalizedImage,
    employeeFullName.trim(),
  );

  const rowImage = await cropEmployeeRow(normalizedImage, locator);
  const segmentImages = await makeSegments(rowImage);

  const segmentResults = await Promise.all(
    segmentImages.map((segment) =>
      parseSegment(segment, totalDays, employeeFullName.trim()),
    ),
  );

  const candidatesByDay = new Map<number, OcrCell[]>();

  for (const result of segmentResults) {
    for (const cell of result.cells) {
      const candidates = candidatesByDay.get(cell.day) ?? [];
      candidates.push(cell);
      candidatesByDay.set(cell.day, candidates);
    }
  }

  const missingDays: number[] = [];
  const parsedDays: ParsedDay[] = [];

  for (let day = 1; day <= totalDays; day++) {
    const candidates = candidatesByDay.get(day) ?? [];

    if (candidates.length === 0) {
      missingDays.push(day);
      continue;
    }

    const cell = chooseCell(candidates);
    const fallbackStatus = defaultStatusForDay(year, month, day);

    if (cell.cellType === 'cross') {
      parsedDays.push({
        day,
        status: 'dayoff',
        hours: null,
      });
      continue;
    }

    if (cell.cellType === 'written' && cell.hours !== null) {
      parsedDays.push({
        day,
        status: 'worked',
        hours: cell.hours,
      });
      continue;
    }

    if (
      cell.cellType === 'special' &&
      cell.statusHint &&
      cell.statusHint !== 'worked'
    ) {
      parsedDays.push({
        day,
        status: cell.statusHint,
        hours: null,
      });
      continue;
    }

    // Empty/uncertain cells are represented by the normal calendar status,
    // but NEVER get fabricated hours.
    parsedDays.push({
      day,
      status: fallbackStatus,
      hours: null,
    });
  }

  if (missingDays.length > 0) {
    throw new Error(
      `OCR did not reliably return all days for "${employeeFullName}". Missing: ${missingDays.join(', ')}`,
    );
  }

  if (parsedDays.length !== totalDays) {
    throw new Error(
      `OCR returned ${parsedDays.length} days, expected ${totalDays}`,
    );
  }

  return parsedDays;
};
