import { Clapperboard } from 'lucide-react';
import { useSiteContent } from '../../cms/SiteContentContext';
import { SectionHeading } from '../SectionHeading';
import { SectionScene } from '../SectionScene';
import { MediaCarousel } from './MediaCarousel';

export function MediaSection() {
  const { media } = useSiteContent();

  return (
    <section id="media" className="section media-section">
      <SectionScene variant="documentation" />
      <div className="container">
        <SectionHeading
          eyebrow="Media and Content"
          title="Straight from our social channels"
          description="Stay updated with our latest projects, announcements, insights, and company activities."
        />

        {media.length ? (
          <MediaCarousel items={media} />
        ) : (
          <div className="media-empty" role="status" data-reveal>
            <Clapperboard aria-hidden="true" />
            <h3>Media and content will appear here soon.</h3>
            <p>Posts published on the company social channels are shown in this section.</p>
          </div>
        )}
      </div>
    </section>
  );
}
