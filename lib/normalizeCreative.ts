// Facebook's creative shape isn't consistent across ad formats — the same field
// (image, headline, body...) can live in `object_story_spec.link_data`,
// `object_story_spec.video_data`, or flat on `creative` itself, depending on the ad.
// This is the one place that resolves the fallback chain — SlideView and AdsStructure
// both consume the result instead of independently re-deriving it.

export interface RawCreative {
  title?: string;
  body?: string;
  image_url?: string;
  thumbnail_url?: string;
  call_to_action_type?: string;
  object_story_spec?: {
    link_data?: {
      message?: string;
      name?: string;
      description?: string;
      picture?: string;
      link?: string;
    };
    video_data?: { message?: string; title?: string; image_url?: string };
  };
}

export interface NormalizedCreative {
  image: string;
  headline: string;
  body: string;
  cta: string;
}

export function normalizeCreative(creative: RawCreative): NormalizedCreative {
  const linkData = creative.object_story_spec?.link_data;
  const videoData = creative.object_story_spec?.video_data;

  return {
    body: linkData?.message ?? videoData?.message ?? creative.body ?? "",
    headline: linkData?.name ?? videoData?.title ?? creative.title ?? "",
    image: linkData?.picture ?? videoData?.image_url ?? creative.image_url ?? creative.thumbnail_url ?? "",
    cta: creative.call_to_action_type?.replace(/_/g, " ") ?? "",
  };
}
