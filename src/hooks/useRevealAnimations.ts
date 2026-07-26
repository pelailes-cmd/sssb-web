import { useEffect } from 'react';
import { useReducedMotion } from './useReducedMotion';

export function useRevealAnimations() {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

    if (reducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return undefined;
    }

    document.documentElement.classList.add('motion-ready');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );

    const observeElement = (element: HTMLElement) => {
      if (!element.classList.contains('is-visible')) observer.observe(element);
    };

    const visitRevealElements = (node: Node, callback: (element: HTMLElement) => void) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches('[data-reveal]')) callback(node);
      node.querySelectorAll<HTMLElement>('[data-reveal]').forEach(callback);
    };

    elements.forEach(observeElement);

    const mutationObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === 'attributes') {
          visitRevealElements(record.target, observeElement);
          return;
        }

        record.removedNodes.forEach((node) =>
          visitRevealElements(node, (element) => observer.unobserve(element)),
        );
        record.addedNodes.forEach((node) => visitRevealElements(node, observeElement));
      });
    });
    mutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
      document.documentElement.classList.remove('motion-ready');
    };
  }, [reducedMotion]);
}
