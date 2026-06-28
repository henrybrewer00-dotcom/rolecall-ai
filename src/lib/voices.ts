// Curated ElevenLabs voices for the practice buyer. Used by the module voice
// picker; the backend auto-selects one by the buyer's gender when a module is built.
export type Voice = { id: string; name: string; gender: "male" | "female" | "neutral"; desc: string };

export const VOICES: Voice[] = [
  // Female
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female", desc: "Mature, reassuring, confident" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", gender: "female", desc: "Knowledgeable, professional" },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", gender: "female", desc: "Professional, bright, warm" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "female", desc: "Clear, engaging (British)" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", gender: "female", desc: "Playful, bright, warm" },
  // Male
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", gender: "male", desc: "Smooth, trustworthy" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", gender: "male", desc: "Deep, resonant" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", gender: "male", desc: "Dominant, firm" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", gender: "male", desc: "Deep, confident, energetic" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", gender: "male", desc: "Wise, mature, balanced" },
  // Neutral
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River", gender: "neutral", desc: "Relaxed, neutral, informative" },
];

export const voiceById = (id?: string | null): Voice | undefined => VOICES.find((v) => v.id === id);
