import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
    includeIgnoreFile(gitignorePath),
    js.configs.recommended,
    ...ts.configs.recommended,
    {
        languageOptions: { 
            globals: { ...globals.browser } 
        },
        rules: {
            "no-undef": 'off', // TypeScript handles this
            "@typescript-eslint/no-unused-vars": "warn", // Warn instead of error
            "@typescript-eslint/no-explicit-any": "off" // Allow 'any' for game jam speed
        }
    }
);

