import { MapPin } from 'lucide-react';
import { useServiceArea } from '../cms/ServiceAreaContext';
import { serviceAreaOptions } from '../data/siteData';

type ServiceAreaFilterProps = {
  /** Announced to screen readers so each section's control is distinguishable. */
  sectionLabel: string;
  inverse?: boolean;
};

/**
 * Location availability control shared by the services, products and promotions sections.
 * All three read one preference, so a choice made in any of them applies across the page.
 */
export function ServiceAreaFilter({ sectionLabel, inverse = false }: ServiceAreaFilterProps) {
  const { area, selectArea } = useServiceArea();

  return (
    <div
      className={`area-filter${inverse ? ' area-filter--inverse' : ''}`}
      data-reveal
      role="group"
      aria-label={`Filter ${sectionLabel} by location availability`}
    >
      <p className="area-filter__label">
        <MapPin aria-hidden="true" size={16} />
        Location availability
      </p>
      <div className="area-filter__options">
        <button type="button" aria-pressed={area === null} onClick={() => selectArea(null)}>
          All locations
        </button>
        {serviceAreaOptions.map((option) => (
          <button
            key={option.code}
            type="button"
            aria-pressed={area === option.code}
            onClick={() => selectArea(option.code)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
