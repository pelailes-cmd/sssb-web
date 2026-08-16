import { ArrowUpRight, Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useServiceArea } from '../cms/ServiceAreaContext';
import { useSiteContent } from '../cms/SiteContentContext';
import {
  catalogCollectionModels,
  isAvailableInArea,
  productCategories,
  type Product,
  type ProductCategory,
} from '../data/siteData';
import { ProductDialog } from './ProductDialog';
import { ProductModelPreview } from './ProductModelPreview';
import { SectionHeading } from './SectionHeading';
import { SectionScene } from './SectionScene';
import { ServiceAreaFilter } from './ServiceAreaFilter';

type Filter = 'All' | ProductCategory;

export function ProductCatalog() {
  const { products } = useSiteContent();
  const { area } = useServiceArea();
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const areaProducts = useMemo(
    () => products.filter((product) => isAvailableInArea(product, area)),
    [area, products],
  );

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return areaProducts.filter((product) => {
      const matchesFilter = filter === 'All' || product.category === filter;
      const matchesQuery =
        !normalizedQuery ||
        [
          product.name,
          product.brand,
          product.category,
          product.eyebrow,
          ...(product.models?.map((model) => model.label) ?? []),
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedQuery));
      return matchesFilter && matchesQuery;
    });
  }, [areaProducts, filter, query]);

  const closeDialog = useCallback(() => setSelectedProduct(null), []);

  return (
    <section id="products" className="section products-section">
      <SectionScene variant="products" />
      <div className="container">
        <div className="products-section__heading-row">
          <SectionHeading
            eyebrow="Source-verified catalog"
            title="Solar equipment and supporting products"
            description="Explore matching products as interactive 3D models, with source-verified specifications rebuilt as accessible native content."
          />
          <div className="products-section__count" data-reveal>
            <strong>{areaProducts.length}</strong>
            <span>product groups</span>
          </div>
        </div>

        <ServiceAreaFilter sectionLabel="products" />

        <div className="catalog-model-showcase" data-reveal>
          <div className="catalog-model-showcase__copy">
            <p className="eyebrow">Interactive model library</p>
            <h3>Explore the supplied product collection in 3D</h3>
            <p>
              Drag to inspect the collection from different angles. Individual matching models are
              available directly in the product cards and detail views below.
            </p>
            <div className="catalog-model-showcase__signals" aria-label="3D preview features">
              <span>37 supplied 3D views</span>
              <span>Touch + keyboard controls</span>
              <span>Loaded only when visible</span>
            </div>
          </div>
          <div className="catalog-model-showcase__visual">
            <ProductModelPreview
              models={catalogCollectionModels}
              productName="Smart Save Solar product collection"
              mode="showcase"
            />
          </div>
        </div>

        <div className="catalog-tools" data-reveal>
          <label className="catalog-search">
            <Search aria-hidden="true" size={19} />
            <span className="sr-only">Search products</span>
            <input
              type="search"
              value={query}
              placeholder="Search products or brands"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="catalog-filters" aria-label="Filter products by category">
            <SlidersHorizontal aria-hidden="true" size={18} />
            {productCategories.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={filter === category}
                onClick={() => setFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <p className="catalog-status" aria-live="polite">
          Showing {visibleProducts.length} of {areaProducts.length} product groups
        </p>

        {visibleProducts.length ? (
          <div className="product-grid">
            {visibleProducts.map((product, index) => (
              <article
                key={product.id}
                className={`product-card${product.featured ? ' product-card--featured' : ''}`}
                data-reveal
                style={
                  { '--reveal-delay': `${Math.min(index % 4, 3) * 70}ms` } as React.CSSProperties
                }
              >
                <div className="product-card__visual">
                  <ProductModelPreview
                    models={product.models}
                    fallbackImage={product.images[0]}
                    productName={product.name}
                  />
                </div>
                <div className="product-card__content">
                  <div className="product-card__meta">
                    <span>{product.category}</span>
                    {product.brand ? <strong>{product.brand}</strong> : null}
                  </div>
                  <h3>{product.name}</h3>
                  <p className="product-card__eyebrow">{product.eyebrow}</p>
                  <p>{product.summary}</p>
                  <button
                    className="product-card__details"
                    type="button"
                    onClick={() => setSelectedProduct(product)}
                  >
                    View Details
                    <ArrowUpRight aria-hidden="true" size={18} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="catalog-empty" role="status">
            <Search aria-hidden="true" />
            <h3>No matching product group</h3>
            <p>Try a broader search or select “All.”</p>
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                setQuery('');
                setFilter('All');
              }}
            >
              Reset catalog
            </button>
          </div>
        )}
      </div>

      <ProductDialog
        key={selectedProduct?.id ?? 'none'}
        product={selectedProduct}
        onClose={closeDialog}
      />
    </section>
  );
}
