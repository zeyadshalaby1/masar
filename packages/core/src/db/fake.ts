/**
 * Test data without a dependency: Arabic and English names, text, numbers, dates. Seeded, so the
 * same seed gives the same data (handy for screenshots and bug reports).
 */

const FIRST_EN = ['Ahmed', 'Sara', 'Omar', 'Lina', 'Youssef', 'Mariam', 'Karim', 'Nour', 'Hassan', 'Laila', 'Ziad', 'Hana', 'Adam', 'Salma', 'Ali', 'Farida', 'Mostafa', 'Jana', 'Tarek', 'Malak', 'Emma', 'Liam', 'Olivia', 'Noah']
const LAST_EN = ['Hassan', 'Mahmoud', 'Ibrahim', 'Saleh', 'Kamal', 'Farouk', 'Mansour', 'Nabil', 'Fathy', 'Shalaby', 'Adel', 'Sami', 'Brown', 'Smith', 'Garcia', 'Wilson']
const FIRST_AR = ['أحمد', 'سارة', 'عمر', 'لينا', 'يوسف', 'مريم', 'كريم', 'نور', 'حسن', 'ليلى', 'زياد', 'هنا', 'آدم', 'سلمى', 'علي', 'فريدة', 'مصطفى', 'جنى', 'طارق', 'ملك']
const LAST_AR = ['حسن', 'محمود', 'إبراهيم', 'صالح', 'كمال', 'فاروق', 'منصور', 'نبيل', 'فتحي', 'شلبي', 'عادل', 'سامي']
const WORDS_EN =
  'learn build course lesson design data course path clear fast simple module page action model student teacher video project practice skill code start finish idea production team plan review'.split(' ')
const WORDS_AR = 'تعلم بناء كورس درس تصميم بيانات مسار واضح سريع بسيط صفحة طالب مدرس فيديو مشروع تدريب مهارة كود بداية فكرة إنتاج فريق خطة مراجعة شرح أساسيات متقدم'.split(' ')
const DOMAINS = ['example.com', 'mail.test', 'masar.dev']

/** mulberry32: tiny, fast, good enough for test data. */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type FakeLocale = 'en' | 'ar'

export function createFake(seed = Date.now(), defaultLocale: FakeLocale = 'en') {
  const next = random(seed)
  const used = new Set<string>()
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const words = (count: number, locale: FakeLocale) => Array.from({ length: count }, () => pick(locale === 'ar' ? WORDS_AR : WORDS_EN))
  const latin = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

  const fake = {
    seed,
    /** A whole number in [min, max]. */
    int,
    /** A number in [min, max] with `decimals` digits. */
    number: (min = 0, max = 1000, decimals = 2) => Number((next() * (max - min) + min).toFixed(decimals)),
    /** true with probability `chance` (0..1). */
    boolean: (chance = 0.5) => next() < chance,
    pick,
    /** `count` different items from a list. */
    sample: <T>(list: readonly T[], count: number): T[] => [...list].sort(() => next() - 0.5).slice(0, count),
    firstName: (locale: FakeLocale = defaultLocale) => pick(locale === 'ar' ? FIRST_AR : FIRST_EN),
    lastName: (locale: FakeLocale = defaultLocale) => pick(locale === 'ar' ? LAST_AR : LAST_EN),
    name: (locale: FakeLocale = defaultLocale) => `${fake.firstName(locale)} ${fake.lastName(locale)}`,
    /** Unique within this run. */
    email: (name?: string) => {
      const base = latin(name && /[a-z]/i.test(name) ? name : `${pick(FIRST_EN)}.${pick(LAST_EN)}`) || 'user'
      let email = `${base}@${pick(DOMAINS)}`
      while (used.has(email)) email = `${base}${int(1, 9999)}@${pick(DOMAINS)}`
      used.add(email)
      return email
    },
    /** Egyptian mobile number. */
    phone: () => `01${pick(['0', '1', '2', '5'])}${String(int(0, 99999999)).padStart(8, '0')}`,
    word: (locale: FakeLocale = defaultLocale) => pick(locale === 'ar' ? WORDS_AR : WORDS_EN),
    words: (count = 3, locale: FakeLocale = defaultLocale) => words(count, locale).join(' '),
    /** A short title, capitalized in English. */
    title: (locale: FakeLocale = defaultLocale) => {
      const text = words(int(2, 5), locale).join(' ')
      return locale === 'ar' ? text : cap(text)
    },
    sentence: (locale: FakeLocale = defaultLocale) => {
      const text = words(int(6, 14), locale).join(' ')
      return locale === 'ar' ? `${text}.` : `${cap(text)}.`
    },
    paragraph: (sentences = 4, locale: FakeLocale = defaultLocale) => Array.from({ length: sentences }, () => fake.sentence(locale)).join(' '),
    slug: (text?: string) => (text ?? words(3, 'en').join(' ')).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') + `-${int(100, 999)}`,
    /** ISO date within the last `days` days. */
    past: (days = 365) => new Date(Date.now() - next() * days * 86_400_000).toISOString(),
    /** ISO date within the next `days` days. */
    future: (days = 365) => new Date(Date.now() + next() * days * 86_400_000).toISOString(),
    between: (from: Date | string, to: Date | string) => {
      const a = new Date(from).getTime()
      const b = new Date(to).getTime()
      return new Date(a + next() * (b - a)).toISOString()
    },
    color: () => `#${int(0, 0xffffff).toString(16).padStart(6, '0')}`,
    /** Price in a round-ish amount, e.g. 149, 299.99 */
    price: (min = 50, max = 2000) => Math.round(fake.number(min, max, 0) / 10) * 10 - (fake.boolean(0.4) ? 0.01 : 0),
    /** Build `count` items: fake.many(20, (i) => ({ title: fake.title() })) */
    many: <T>(count: number, make: (index: number) => T): T[] => Array.from({ length: count }, (_, i) => make(i)),
  }
  return fake
}

export type Fake = ReturnType<typeof createFake>
