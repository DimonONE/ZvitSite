// Прибирає діакритику (é, á, š, č, ř, ...) — розпізнавання фото часто
// губить або плутає діакритичні знаки в чеських/українських назвах.
const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Нормалізує ім'я/назву для порівняння: без діакритики, нижній регістр,
// без пунктуації, без зайвих пробілів (скорочення на кшталт
// "Markovyc Tol." vs "Markovyc Tolik", або "Moskevska49" vs "Moskevska 49").
export const normalizeName = (name: string) =>
  stripDiacritics(name)
    .toLowerCase()
    .replace(/[.,:;'"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Варіант без пробілів взагалі — покриває випадки, коли AI/людина
// пише назву разом або нарізно ("Moskevska49" / "Moskevska 49").
const normalizeNameNoSpaces = (name: string) => normalizeName(name).replace(/\s+/g, '');

export const namesLooselyMatch = (a: string, b: string): boolean => {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (normalizeNameNoSpaces(a) === normalizeNameNoSpaces(b)) return true;

  const wordsA = na.split(' ').filter(Boolean);
  const wordsB = nb.split(' ').filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  // Кожне слово з коротшого імені має бути префіксом якогось слова в довшому
  // (покриває скорочення на кшталт "Tol." <-> "Tolik", "І." <-> "Іван").
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  return shorter.every((w) => longer.some((lw) => lw.startsWith(w) || w.startsWith(lw)));
};

// Скільки слів з "a" мають відповідник (за тим самим "префіксним" правилом,
// що і namesLooselyMatch) серед слів "b". Використовується, щоб знайти
// НАЙБІЛЬШ ПОХОЖУ назву навіть тоді, коли збіг неповний (наприклад,
// розпізнавання не дописало частину адреси чи переплутало одну літеру).
const wordOverlapScore = (a: string, b: string): number => {
  const wordsA = normalizeName(a).split(' ').filter(Boolean);
  const wordsB = normalizeName(b).split(' ').filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const usedB = new Set<number>();
  let score = 0;
  for (const wa of wordsA) {
    const idx = wordsB.findIndex((wb, i) => !usedB.has(i) && (wb.startsWith(wa) || wa.startsWith(wb)));
    if (idx !== -1) {
      usedB.add(idx);
      score++;
    }
  }
  return score;
};

// Знаходить у списку "candidates" той, чия назва найбільш схожа на
// "recognized" — навіть якщо повного збігу нема (типова ситуація для
// розпізнаного з фото тексту). Повертає null, якщо жоден кандидат не має
// СПІЛЬНОГО жодного слова з розпізнаною назвою (щоб не підставляти
// випадкове місто).
export const findBestNameMatch = <T,>(
  candidates: T[],
  recognized: string,
  getName: (item: T) => string
): T | null => {
  if (!recognized.trim()) return null;

  // Спершу шукаємо повний (loose) збіг — він надійніший за скоринг.
  const exact = candidates.find((c) => namesLooselyMatch(getName(c), recognized));
  if (exact) return exact;

  // Інакше беремо кандидата з найбільшим перетином слів.
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = wordOverlapScore(getName(c), recognized);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore > 0 ? best : null;
};