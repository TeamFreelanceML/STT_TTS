export interface StoryChunkData {
  id: string;
  text: string;
}

export interface StoryParagraphData {
  id: string;
  chunks: StoryChunkData[];
}

export interface StructuredStoryData {
  title: string;
  paragraphs: StoryParagraphData[];
}

export const structuredStory: StructuredStoryData = {
  title: "Mother Bear in Spring",
  paragraphs: [
    {
      id: "para_1",
      chunks: [
        {
          id: "para_1_chunk_1",
          text: "It is the first warm day of spring. [...] A mother bear slowly peeks out of a hollow tree trunk [...] on the side of a quiet mountain. [...] She and her two cubs have slept all winter. [...] The cubs drank milk from their mother [...] but the mother bear ate nothing. [...] She is very hungry.",
        },
      ],
    },
    {
      id: "para_2",
      chunks: [
        {
          id: "para_2_chunk_1",
          text: "The cubs blink in the bright sunlight [...] and tumble out of the tree behind her. [...] The snow is melting [...] and tiny streams of water trickle down the rocks. [...] The air smells fresh [...] and full of new life. [...] The mother bear listens carefully... [...] making sure the forest is safe.",
        },
      ],
    },
    {
      id: "para_3",
      chunks: [
        {
          id: "para_3_chunk_1",
          text: "She leads her cubs down the mountain path [...] toward a river she remembers. [...] Along the way she digs into the soft ground for roots [...] and turns over fallen logs to find insects. [...] The cubs watch her closely [...] learning how to search and how to survive.",
        },
      ],
    },
    {
      id: "para_4",
      chunks: [
        {
          id: "para_4_chunk_1",
          text: "At last they reach the rushing river. [...] Silver fish swim beneath the clear water. [...] With a quick and powerful swipe [...] the mother bear catches one. [...] The cubs squeal with excitement [...] as she shares the meal. [...] Spring has begun [...] and their new season of life together is just starting.",
        },
      ],
    },
  ],
};

export function structuredStoryToText(story: StructuredStoryData): string {
  return story.paragraphs
    .map((paragraph) => paragraph.chunks.map((chunk) => chunk.text.trim()).join(" "))
    .join("\n\n");
}
