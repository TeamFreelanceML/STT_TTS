export const API_BASE_URL = "/api";

export interface Voice {
  client_voice_id: string;
  display_name?: string;
  voice_name?: string;
  category: string;
  gender: string;
  age?: string;
  description?: string;
  registry_key: string;
}

export interface NarrationRequest {
  story: { id: number; name: string };
  voice: { voice_id: string; language: string };
  speech_config: { wpm: number; chunk_delimiter?: string };
  text: { story_text: { para_id: number; para_text: string }[] };
  output_config: { include_word_timestamps: boolean; include_chunk_timestamps: boolean };
}

export interface NarrationResponse {
  job_id: string;
  status: "pending" | "processing" | "complete" | "failed";
  result?: {
    story: { id: number; name: string };
    audio: { url: string; duration_ms: number };
    alignment: {
      paragraphs: {
        para_id: number;
        start_ms: number;
        end_ms: number;
        chunks: any[];
      }[];
    };
  };
  progress?: { completed: number; total: number };
}

export async function getVoices(): Promise<{ voices: Voice[]; total: number }> {
  const response = await fetch(`${API_BASE_URL}/voices`);
  if (!response.ok) throw new Error("Failed to fetch voices");
  return response.json();
}

export async function submitNarration(data: NarrationRequest): Promise<{ job_id: string }> {
  const response = await fetch(`${API_BASE_URL}/narrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Narration request failed");
  }
  return response.json();
}

export async function pollNarration(jobId: string): Promise<NarrationResponse> {
  const response = await fetch(`${API_BASE_URL}/narrate/${jobId}`);
  if (!response.ok) throw new Error("Polling failed");
  return response.json();
}

export async function getJobs(): Promise<{ jobs: any[] }> {
  const response = await fetch(`${API_BASE_URL}/jobs`);
  if (!response.ok) throw new Error("Failed to fetch jobs");
  return response.json();
}

export async function getStats(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/stats`);
  if (!response.ok) throw new Error("Failed to fetch stats");
  return response.json();
}

export interface WordNarrationRequest {
  voice: { voice_id: string; language: string };
  speech_config: { wpm: number };
  word: string;
}

export async function narrateWord(data: WordNarrationRequest): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/narrate/word`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Word narration failed");
  return response.json();
}
