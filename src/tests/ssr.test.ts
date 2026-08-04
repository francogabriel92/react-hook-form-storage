/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { useFormStorage } from '../use-react-hook-form-storage';

const SSRForm = () => {
  const form = useForm({ defaultValues: { name: '' } });
  const { isRestored, isLoading } = useFormStorage('ssr-key', form);

  return createElement(
    'span',
    null,
    `restored:${isRestored} loading:${isLoading}`
  );
};

describe('useFormStorage (SSR)', () => {
  it('Should render without window/localStorage without crashing', () => {
    // Guards the premise: this file really runs without a DOM.
    expect(typeof window).toBe('undefined');

    const html = renderToString(createElement(SSRForm));

    expect(html).toContain('restored:false');
  });
});
