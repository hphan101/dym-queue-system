import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default {
  plugins: [
    {
      postcssPlugin: 'astryx-toast-motion',
      Declaration(declaration) {
        const file = declaration.source?.input.file ?? '';
        if (declaration.prop !== 'transition-property' || !/[/\\]@astryxdesign[/\\]core[/\\].*astryx\.css$/.test(file)) return;
        const properties = declaration.value.split(',').map(value => value.trim());
        if (properties.includes('grid-template-rows') && properties.includes('padding')) {
          declaration.value = properties.filter(value => value !== 'padding').join(', ');
        }
      },
    },
    tailwindcss(),
    autoprefixer(),
  ],
};
