export type NavItem = {
  label: string;
  href: `#${string}`;
};

export type Service = {
  id: string;
  title: string;
  description: string;
  icon: 'home' | 'building' | 'factory' | 'tools' | 'shield';
  source: 'cover' | 'business-message';
};

export type ProductSpec = {
  label: string;
  value: string;
};

export type ProductImage = {
  src: string;
  alt: string;
};

export type ProductModel = {
  src: `/assets/models/${string}.glb`;
  label: string;
};

export type Product = {
  id: string;
  name: string;
  brand?: string;
  category: ProductCategory;
  eyebrow: string;
  summary: string;
  images: ProductImage[];
  models?: ProductModel[];
  specs: ProductSpec[];
  sourceNote?: string;
  featured?: boolean;
};

export type ProductCategory =
  | 'Solar Panels'
  | 'Inverters'
  | 'Energy Storage'
  | 'Air Conditioning'
  | 'Solar Lighting'
  | 'Balance of System';

export type PromotionStatus = 'active' | 'inactive' | 'unverified';

export type Promotion = {
  id: string;
  title: string;
  supportingLine: string;
  status: PromotionStatus;
  statusLabel: string;
  condition: string;
  image: ProductImage;
  offers: Array<{
    threshold: string;
    inclusion: string;
  }>;
  highlights: string[];
};

export type DocumentEntry = {
  id: string;
  title: string;
  product: string;
  category: string;
  fileType: string;
  fileSize?: string;
  href: string;
};

export type PortfolioEntry = {
  id: string;
  title: string;
  image: ProductImage;
  verifiedDetails: string[];
};

export const business = {
  name: 'Smart Save Solar Bicol',
  supportingName: 'Smart Save Ventures Corp.',
  tagline: 'Solar You Can Trust',
  phoneDisplay: '0997-688-4865',
  phoneHref: 'tel:+639976884865',
  address: 'Zone 1, Caroyroyan, Pili, Camarines Sur',
  mapHref:
    'https://www.google.com/maps/search/?api=1&query=Zone+1%2C+Caroyroyan%2C+Pili%2C+Camarines+Sur',
} as const;

export const navItems: NavItem[] = [
  { label: 'Home', href: '#home' },
  { label: 'Services', href: '#services' },
  { label: 'Products', href: '#products' },
  { label: 'Promotions', href: '#promotions' },
  { label: 'Documentation & Datasheet', href: '#documentation' },
  { label: 'Portfolio', href: '#portfolio' },
  { label: 'Contact Us', href: '#contact' },
  { label: 'About Us', href: '#about' },
];

export const services: Service[] = [
  {
    id: 'residential',
    title: 'Residential Solar Systems',
    description:
      'Solar system inquiries for homes, with installation quality and dependable support kept in view from the start.',
    icon: 'home',
    source: 'cover',
  },
  {
    id: 'commercial',
    title: 'Commercial Solar Solutions',
    description:
      'Solar solutions for commercial requirements, supported by a local team in Pili, Camarines Sur.',
    icon: 'building',
    source: 'cover',
  },
  {
    id: 'industrial',
    title: 'Industrial Solar Projects',
    description:
      'A direct inquiry path for industrial solar projects and the equipment categories shown in the supplied catalog.',
    icon: 'factory',
    source: 'cover',
  },
  {
    id: 'after-sales',
    title: 'After-Sales Support & Maintenance',
    description:
      'Responsive assistance and maintenance after installation—the support commitment stated in the supplied materials.',
    icon: 'tools',
    source: 'cover',
  },
  {
    id: 'warranty-assistance',
    title: 'Warranty Assistance',
    description:
      'Help navigating warranty concerns without publishing unsupported warranty terms or durations.',
    icon: 'shield',
    source: 'business-message',
  },
];

const productModel = (file: string, label: string): ProductModel => ({
  src: `/assets/models/${file}.glb`,
  label,
});

export const catalogCollectionModels = [
  productModel('all_products_collection', 'Smart Save Solar supplied product collection'),
] as const;

const productModelSets = {
  aesolar730: [productModel('aesolar_730w_bifacial_panel', 'AESOLAR 730W bifacial panel')],
  solisHybrid: [
    productModel('solis_hybrid_inverter_8kw', 'Solis 8kW hybrid inverter'),
    productModel('solis_hybrid_inverter_10kw', 'Solis 10kW hybrid inverter'),
    productModel('solis_hybrid_inverter_12kw', 'Solis 12kW hybrid inverter'),
  ],
  protectiveDevices: [
    productModel('all_protective_devices', 'Complete AC/DC protective-device lineup'),
    productModel('ac_breaker_c63', 'C63 two-pole AC breaker'),
    productModel('automatic_transfer_switch_125a', '125A automatic transfer switch'),
    productModel('breaker_d125_125a', 'D125 125A two-pole breaker'),
    productModel('dc_breaker_csbb125_20a', 'CSBB-125 20A DC breaker'),
    productModel('dc_breaker_csbb125_32a', 'CSBB-125 32A DC breaker'),
    productModel('dc_breaker_csbb125_63a', 'CSBB-125 63A DC breaker'),
    productModel('dc_breaker_csbb125_125a', 'CSBB-125 125A DC breaker'),
    productModel('dc_mccb_160a', '160A molded-case DC circuit breaker'),
    productModel('surge_protector_bdp30', 'BDP-30 surge protective device'),
    productModel('surge_protector_bdp60', 'BDP-60 surge protective device'),
  ],
  mountingAccessories: [
    productModel('l_foot_bracket', 'Solar rail L-foot bracket'),
    productModel('rail_splice', 'Aluminum solar-rail splice'),
    productModel('mid_clamp', 'Solar-panel mid clamp'),
    productModel('end_clamp', 'Solar-panel end clamp'),
    productModel('aluminum_rail', 'PV mounting aluminum rail'),
    productModel('battery_lugs_pair', 'Copper battery-lug pair'),
    productModel('tile_roof_bracket', 'Tile-roof solar mounting bracket'),
    productModel('mc4_connector_negative', 'Negative MC4 solar connector'),
    productModel('grounding_lug', 'PV rail grounding lug'),
    productModel('mc4_connector_positive', 'Positive MC4 solar connector'),
    productModel('earthing_washer', 'Serrated PV earthing washer'),
    productModel('expansion_bolt_and_shield', 'Expansion bolts with shields'),
    productModel('tox_and_screw', 'Wall plugs and screws'),
    productModel('roofing_screw', 'Self-drilling roofing screws'),
    productModel('rubber_and_electrical_tape', 'Rubber and electrical tape rolls'),
  ],
  windowAircon2Hp: [productModel('window_ac_2hp_kc12k', 'KC-12K 2.0HP window-type unit')],
  windowAircon1Hp: [productModel('window_ac_1hp_kc09k', 'KC-09K 1.0HP window-type unit')],
  splitAircon1Hp: [productModel('split_ac_1hp_kf09gw', 'KF-09GW/IH009 1.0HP split-type unit')],
  splitAircon1Point5Hp: [
    productModel('split_ac_1_5hp_kf12gw', 'KF-12GW/H012A 1.5HP split-type unit'),
  ],
  floodlight200w: [productModel('solar_floodlight_200w_kit', 'Smart Save 200W floodlight kit')],
  floodlight100w: [productModel('solar_floodlight_100w_kit', 'Smart Save 100W floodlight kit')],
} as const satisfies Record<string, readonly ProductModel[]>;

export const products: Product[] = [
  {
    id: 'aesolar-730w',
    name: '730W Bifacial Double-Glass Solar Panel',
    brand: 'AESOLAR',
    category: 'Solar Panels',
    eyebrow: '730W · 23.53% maximum efficiency',
    summary:
      'A bifacial, double-glass AESOLAR module presented at 730W peak power in the supplied product artwork.',
    images: [
      {
        src: '/assets/products/aesolar-730w.webp',
        alt: 'Front and rear view of an AESOLAR 730W bifacial double-glass solar panel',
      },
      {
        src: '/assets/products/aesolar-730w-alt.webp',
        alt: 'Alternate supplied view of the AESOLAR 730W solar panel',
      },
    ],
    models: [...productModelSets.aesolar730],
    specs: [
      { label: 'Construction', value: 'Bifacial double-glass' },
      { label: 'Peak Power (Pmax)', value: '730W' },
      { label: 'Maximum efficiency', value: '23.53%' },
      { label: 'Maximum Power Current (Imp)', value: '17.51' },
      { label: 'Maximum Power Voltage (Vmp)', value: '41.70' },
      { label: 'Open Circuit Voltage (Voc)', value: '49.50' },
      { label: 'Short Circuit Current (Isc)', value: '18.49' },
      { label: 'Maximum System Voltage', value: '1500' },
    ],
    sourceNote:
      'Electrical values are preserved exactly as printed. The supplied artwork does not append unit suffixes to the current, voltage, or maximum-system-voltage rows.',
    featured: true,
  },
  {
    id: 'aesolar-620w',
    name: '620W Bifacial Double-Glass Solar Panel',
    brand: 'AESOLAR',
    category: 'Solar Panels',
    eyebrow: '620W · 22.97% maximum efficiency',
    summary:
      'A bifacial, double-glass AESOLAR module presented at 620W peak power in the supplied product artwork.',
    images: [
      {
        src: '/assets/products/aesolar-620w.webp',
        alt: 'Front, side, and rear view of an AESOLAR 620W bifacial double-glass solar panel',
      },
    ],
    specs: [
      { label: 'Construction', value: 'Bifacial double-glass' },
      { label: 'Peak Power (Pmax)', value: '620W' },
      { label: 'Maximum efficiency', value: '22.97%' },
      { label: 'Maximum Power Current (Imp)', value: '14.98' },
      { label: 'Maximum Power Voltage (Vmp)', value: '41.40' },
      { label: 'Open Circuit Voltage (Voc)', value: '49.60' },
      { label: 'Short Circuit Current (Isc)', value: '16.30' },
      { label: 'Maximum System Voltage', value: '1500' },
    ],
    sourceNote:
      'Electrical values are preserved exactly as printed. The supplied artwork does not append unit suffixes to the current, voltage, or maximum-system-voltage rows.',
  },
  {
    id: 'solis-hybrid-inverters',
    name: 'Hybrid Inverters — 8kW, 10kW & 12kW',
    brand: 'Solis',
    category: 'Inverters',
    eyebrow: 'Three source-listed capacities',
    summary:
      'The supplied Solis hybrid inverter range is presented in three capacities: 8kW, 10kW, and 12kW.',
    images: [
      {
        src: '/assets/products/solis-hybrid-inverters.webp',
        alt: 'Three white Solis hybrid inverters in 8kW, 10kW, and 12kW capacities',
      },
    ],
    models: [...productModelSets.solisHybrid],
    specs: [
      { label: 'Type', value: 'Hybrid inverter' },
      { label: 'Source-listed capacities', value: '8kW · 10kW · 12kW' },
    ],
    sourceNote:
      'No model numbers or additional electrical specifications are printed in the supplied image.',
    featured: true,
  },
  {
    id: 'smart-save-hybrid-inverters',
    name: 'Hybrid Inverters — 6kW & 10kW',
    brand: 'Smart Save Solar',
    category: 'Inverters',
    eyebrow: '6kW and 10kW variants',
    summary:
      'Two Smart Save Solar hybrid inverter variants shown with source-listed numeric price values.',
    images: [
      {
        src: '/assets/products/smart-save-hybrid-inverters.webp',
        alt: 'Two white Smart Save Solar hybrid inverters in 6kW and 10kW variants',
      },
    ],
    specs: [
      { label: 'Variant', value: '6kW' },
      { label: 'Source-listed value', value: '40,050' },
      { label: 'Variant', value: '10kW' },
      { label: 'Source-listed value', value: '63,000' },
    ],
    sourceNote:
      'The supplied poster does not print a currency symbol. Confirm current pricing and currency before purchase.',
  },
  {
    id: 'lifepo4-batteries',
    name: 'LiFePO4 Battery Modules & Power Walls',
    category: 'Energy Storage',
    eyebrow: 'DJDC and LVTOPSUN',
    summary:
      'A grouped LiFePO4 range with one DJDC battery module and two LVTOPSUN power wall capacities.',
    images: [
      {
        src: '/assets/products/lifepo4-batteries.webp',
        alt: 'DJDC 330Ah and LVTOPSUN 300Ah and 200Ah LiFePO4 battery products',
      },
    ],
    specs: [
      { label: 'DJDC battery module', value: '51.2V · 330Ah · 16.90 kWh' },
      { label: 'LVTOPSUN power wall', value: '51.2V · 300Ah · 15.36 kWh' },
      { label: 'LVTOPSUN power wall', value: '51.2V · 200Ah · 10.24 kWh' },
      { label: 'Chemistry shown', value: 'LiFePO4' },
    ],
    featured: true,
  },
  {
    id: 'protective-devices',
    name: 'AC/DC Protective Devices',
    category: 'Balance of System',
    eyebrow: 'Protection equipment group',
    summary:
      'The supplied range groups AC/DC protection equipment, including breakers, surge protective devices, and a transfer switch.',
    images: [
      {
        src: '/assets/products/protective-devices.webp',
        alt: 'Grouped AC and DC breakers, surge protective devices, and transfer switch',
      },
    ],
    models: [...productModelSets.protectiveDevices],
    specs: [{ label: 'Product group', value: 'AC/DC protective devices' }],
    sourceNote:
      'The small device labels are not consistently legible across the supplied group image, so individual model ratings are not reproduced here.',
  },
  {
    id: 'mounting-accessories',
    name: 'Mounting Systems & Accessories',
    category: 'Balance of System',
    eyebrow: '15 source-listed accessory types',
    summary:
      'A grouped range of mounting, connection, grounding, and roof-installation accessories shown in the supplied catalog image.',
    images: [
      {
        src: '/assets/products/mounting-accessories.webp',
        alt: 'Grid of solar panel mounting hardware, connectors, grounding parts, screws, and tape',
      },
    ],
    models: [...productModelSets.mountingAccessories],
    specs: [
      { label: 'Mounting', value: 'L-foot bracket · Rail splice · Mid clamp · End clamp' },
      { label: 'Rails & lugs', value: 'Aluminum railings · Battery lugs · Grounding lug' },
      { label: 'Roof hardware', value: 'Tile roof bracket · Roofing screw · Tox and screw' },
      { label: 'Connection', value: 'MC4 connector (−) · MC4 connector (+)' },
      {
        label: 'Additional items',
        value: 'Earthing washer · Expansion bolt and shield · Rubber/electric tape',
      },
    ],
  },
  {
    id: 'window-aircon-2hp',
    name: '2.0HP Window-Type Air Conditioner',
    category: 'Air Conditioning',
    eyebrow: 'Model KC-12K',
    summary:
      'A 2.0HP window-type air conditioner with the model and electrical details shown in the supplied product artwork.',
    images: [
      {
        src: '/assets/products/window-aircon-2hp.webp',
        alt: 'Front and rear view of the KC-12K 2.0HP window-type air conditioner',
      },
    ],
    models: [...productModelSets.windowAircon2Hp],
    specs: [
      { label: 'Model', value: 'KC-12K' },
      { label: 'Max. current', value: '6.7A' },
      { label: 'Max. power', value: '1500W' },
      { label: 'Current', value: '5.2A' },
      { label: 'Power', value: '1150W' },
      { label: 'Max. pressure', value: '4.2MPA' },
      { label: 'Net weight', value: '32KG' },
      { label: 'Voltage', value: '208–230V · 60HZ · 1PH' },
      { label: 'Refrigerant', value: 'R410A/520G' },
    ],
  },
  {
    id: 'window-aircon-1hp',
    name: '1.0HP Window-Type Air Conditioner',
    category: 'Air Conditioning',
    eyebrow: 'Model KC-09K',
    summary:
      'A 1.0HP window-type air conditioner with the model and electrical details shown in the supplied product artwork.',
    images: [
      {
        src: '/assets/products/window-aircon-1hp.webp',
        alt: 'Front and rear view of the KC-09K 1.0HP window-type air conditioner',
      },
    ],
    models: [...productModelSets.windowAircon1Hp],
    specs: [
      { label: 'Model', value: 'KC-09K' },
      { label: 'Max. current', value: '5.8A' },
      { label: 'Max. power', value: '1120W' },
      { label: 'Current', value: '3.8A' },
      { label: 'Power', value: '879W' },
      { label: 'Max. pressure', value: '4.2MPA' },
      { label: 'Net weight', value: '27KG' },
      { label: 'Voltage', value: '208–230V · 60HZ · 1PH' },
      { label: 'Refrigerant', value: 'R410A/430G' },
    ],
  },
  {
    id: 'split-aircon-1hp',
    name: '1.0HP Split-Type Air Conditioner',
    category: 'Air Conditioning',
    eyebrow: 'KF-09GW/IH009 · 9000 BTU',
    summary:
      'A 1.0HP split-type air conditioner shown in both specification and source-listed sale artwork.',
    images: [
      {
        src: '/assets/products/split-aircon-1hp.webp',
        alt: 'Indoor and outdoor units of the KF-09GW/IH009 1.0HP split-type air conditioner',
      },
      {
        src: '/assets/products/split-aircon-1hp-sale.webp',
        alt: 'Alternate supplied sale view of the 1.0HP split-type air conditioner',
      },
    ],
    models: [...productModelSets.splitAircon1Hp],
    specs: [
      { label: 'Model / capacity', value: 'KF-09GW/IH009 · 9000 BTU' },
      { label: 'Water proof', value: 'IP24' },
      { label: 'Rated volt', value: '220–240V' },
      { label: 'Rated frequency', value: '50/60HZ' },
      { label: 'Cooling power input', value: '880W' },
      { label: 'Cooling current input', value: '3.8A' },
      { label: 'Maximum operating pressure', value: '4.2MPA' },
      { label: 'Indoor / outdoor unit weight', value: '9/28KG' },
      { label: 'Source-listed sale price', value: '₱10,400' },
    ],
    sourceNote: 'No sale validity date is printed. Confirm price and availability before purchase.',
  },
  {
    id: 'split-aircon-1-5hp',
    name: '1.5HP Split-Type Air Conditioner',
    category: 'Air Conditioning',
    eyebrow: 'KF-12GW/H012A · 12000BTU',
    summary:
      'A 1.5HP split-type air conditioner with the model and operating details shown in the supplied product artwork.',
    images: [
      {
        src: '/assets/products/split-aircon-1-5hp.webp',
        alt: 'Indoor and outdoor units of the KF-12GW/H012A 1.5HP split-type air conditioner',
      },
    ],
    models: [...productModelSets.splitAircon1Point5Hp],
    specs: [
      { label: 'Model / capacity', value: 'KF-12GW/H012A · 12000BTU' },
      { label: 'Water proof', value: 'IP24' },
      { label: 'Rated volt', value: '220–240V' },
      { label: 'Rated frequency', value: '50/60HZ' },
      { label: 'Cooling power input', value: '1200W' },
      { label: 'Cooling current input', value: '9.6A' },
      { label: 'Maximum operating pressure', value: '4.2MPA' },
      { label: 'Indoor / outdoor unit weight', value: '11/33KG' },
      { label: 'Refrigerant', value: 'R410A/800G' },
    ],
  },
  {
    id: 'floodlight-200w',
    name: '200W Solar Flood Light',
    brand: 'Smart Save Solar',
    category: 'Solar Lighting',
    eyebrow: '200W · IP67',
    summary: 'A Smart Save Solar flood-light set supplied with a solar panel and wireless remote.',
    images: [
      {
        src: '/assets/products/floodlight-200w.webp',
        alt: 'Smart Save 200W solar flood light with solar panel and wireless remote',
      },
    ],
    models: [...productModelSets.floodlight200w],
    specs: [
      { label: 'Power', value: '200W' },
      { label: 'Ingress protection shown', value: 'IP67' },
      { label: 'Controls', value: 'Intelligent light control · Wireless remote · Time switch' },
      { label: 'Display', value: 'Electricity display' },
    ],
  },
  {
    id: 'floodlight-100w',
    name: '100W Solar Flood Light',
    brand: 'Smart Save Solar',
    category: 'Solar Lighting',
    eyebrow: '100W · IP67',
    summary: 'A Smart Save Solar flood-light set supplied with a solar panel and wireless remote.',
    images: [
      {
        src: '/assets/products/floodlight-100w.webp',
        alt: 'Smart Save 100W solar flood light with solar panel and wireless remote',
      },
    ],
    models: [...productModelSets.floodlight100w],
    specs: [
      { label: 'Power', value: '100W' },
      { label: 'Ingress protection shown', value: 'IP67' },
      { label: 'Controls', value: 'Intelligent light control · Wireless remote · Time switch' },
      { label: 'Display', value: 'Electricity display' },
    ],
  },
];

export const productCategories: Array<'All' | ProductCategory> = [
  'All',
  'Solar Panels',
  'Inverters',
  'Energy Storage',
  'Air Conditioning',
  'Solar Lighting',
  'Balance of System',
];

export const promotions: Promotion[] = [
  {
    id: 'free-aircon',
    title: 'FREE AIRCON PROMO!',
    supportingLine: 'GO SOLAR AND STAY COOL!',
    status: 'unverified',
    statusLabel: 'Confirm availability',
    condition: '*PROMO IS UNTIL SUPPLIES LAST',
    image: {
      src: '/assets/promotions/free-aircon-products.webp',
      alt: 'Window-type and split-type air conditioners pictured in the supplied free-aircon promotion',
    },
    offers: [
      {
        threshold: 'AVAIL 6KWP UP TO 10KWP SOLAR INSTALLATION',
        inclusion: 'FREE 1 HP WINDOW TYPE AIRCON',
      },
      {
        threshold: 'AVAIL 11KWP AND UP SOLAR INSTALLATION',
        inclusion: 'FREE 1 HP SPLIT TYPE AIRCON',
      },
    ],
    highlights: [
      'SAVE ON ELECTRICITY',
      'CLEAN & RENEWABLE ENERGY',
      'QUALITY PRODUCTS TRUSTED SERVICE',
    ],
  },
];

export const documents: DocumentEntry[] = [];

export const portfolioItems: PortfolioEntry[] = [];
