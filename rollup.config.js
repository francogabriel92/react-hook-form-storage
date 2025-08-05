import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import commonJs from '@rollup/plugin-commonjs';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import dts from 'rollup-plugin-dts';
import terser from '@rollup/plugin-terser';
import packageJson from './package.json';

export default [
  {
    input: 'src/index.ts',
    external: ['react', 'react-hook-form'],
    output: [
      {
        file: packageJson.main,
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: packageJson.module,
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: [
      peerDepsExternal(),
      resolve(),
      commonJs(),

      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: true,
        declarationDir: 'dist',
        rootDir: 'src',
      }),
      terser(),
    ],
    external: ['react', 'react-hook-form'],
  },
  {
    input: 'src/index.ts',
    output: { file: packageJson.types, format: 'esm' },
    plugins: [
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: true,
        emitDeclarationOnly: true,
      }),
      dts,
    ],
    external: ['react', 'react-hook-form'],
  },
];
