import { ArrowRight, Download, FileSearch, FileText, FolderOpen, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { documents } from '../data/siteData';
import { SectionHeading } from './SectionHeading';

export function DocumentationSection() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(documents.map((document) => document.category)))],
    [],
  );
  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return documents.filter((document) => {
      const matchesCategory = category === 'All' || document.category === category;
      const matchesQuery =
        !normalizedQuery ||
        [document.title, document.product, document.category]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  return (
    <section id="documentation" className="section documentation-section">
      <div className="container">
        <SectionHeading
          eyebrow="Documentation & Datasheet"
          title="Technical files, ready when verified documents arrive"
          description="No PDFs, manuals, brochures, certificates, or datasheets were present in the supplied project. This library is wired for future files without publishing fabricated documents."
          align="center"
        />

        {documents.length ? (
          <>
            <div className="document-tools" data-reveal>
              <label>
                <Search aria-hidden="true" size={18} />
                <span className="sr-only">Search documents</span>
                <input
                  type="search"
                  value={query}
                  placeholder="Search technical files"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label>
                <span className="sr-only">Filter documents by category</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="document-list">
              {filteredDocuments.map((document) => (
                <article key={document.id}>
                  <FileText aria-hidden="true" />
                  <div>
                    <h3>{document.title}</h3>
                    <p>{document.product}</p>
                  </div>
                  <span>{document.fileType}</span>
                  {document.fileSize ? <span>{document.fileSize}</span> : null}
                  <a href={document.href}>
                    View or download <Download aria-hidden="true" size={17} />
                  </a>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="document-empty" data-reveal>
            <div className="document-empty__art" aria-hidden="true">
              <FolderOpen />
              <FileSearch />
              <i />
              <i />
            </div>
            <div>
              <p className="eyebrow">Library status</p>
              <h3>No verified documents have been supplied yet.</h3>
              <p>
                Product datasheets and manuals will appear here with search, category filters, file
                types, file sizes, and direct actions once source files are added.
              </p>
              <a href="#contact">
                Ask about available documentation
                <ArrowRight aria-hidden="true" size={17} />
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
