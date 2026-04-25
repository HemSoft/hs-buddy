import { describe, it, expect } from 'vitest'
import { detectLanguage } from './detectLanguage'

describe('detectLanguage', () => {
  describe('extension-based detection', () => {
    it.each([
      ['src/index.ts', 'typescript'],
      ['components/App.tsx', 'tsx'],
      ['lib/utils.js', 'javascript'],
      ['lib/component.jsx', 'jsx'],
      ['package.json', 'json'],
      ['README.md', 'markdown'],
      ['styles.css', 'css'],
      ['theme.scss', 'scss'],
      ['index.html', 'html'],
      ['config.yaml', 'yaml'],
      ['config.yml', 'yaml'],
      ['main.py', 'python'],
      ['app.rb', 'ruby'],
      ['main.go', 'go'],
      ['lib.rs', 'rust'],
      ['Program.cs', 'csharp'],
      ['Main.java', 'java'],
      ['App.kt', 'kotlin'],
      ['ViewController.swift', 'swift'],
      ['main.c', 'c'],
      ['main.cpp', 'cpp'],
      ['header.h', 'c'],
      ['header.hpp', 'cpp'],
      ['script.sh', 'shell'],
      ['script.bash', 'shell'],
      ['script.ps1', 'powershell'],
      ['module.psm1', 'powershell'],
      ['query.sql', 'sql'],
      ['schema.graphql', 'graphql'],
      ['schema.gql', 'graphql'],
      ['config.toml', 'toml'],
      ['config.ini', 'ini'],
      ['main.tf', 'hcl'],
      ['main.hcl', 'hcl'],
      ['App.vue', 'vue'],
      ['App.svelte', 'svelte'],
      ['page.astro', 'astro'],
      ['notes.txt', 'plaintext'],
      ['output.log', 'plaintext'],
      ['data.csv', 'plaintext'],
    ])('detects %s as %s', (filePath, expected) => {
      expect(detectLanguage(filePath)).toBe(expected)
    })
  })

  describe('basename-based detection', () => {
    it('detects Dockerfile', () => {
      expect(detectLanguage('project/Dockerfile')).toBe('dockerfile')
    })

    it('detects Makefile', () => {
      expect(detectLanguage('project/Makefile')).toBe('makefile')
    })

    it('detects .gitignore', () => {
      expect(detectLanguage('.gitignore')).toBe('gitignore')
    })

    it('detects .gitattributes', () => {
      expect(detectLanguage('.gitattributes')).toBe('gitignore')
    })
  })

  describe('dotfile handling', () => {
    it('detects .env as shell', () => {
      expect(detectLanguage('.env')).toBe('shell')
    })

    it('detects .env in a directory', () => {
      expect(detectLanguage('project/.env')).toBe('shell')
    })

    it('detects .dockerfile as dockerfile', () => {
      expect(detectLanguage('.dockerfile')).toBe('dockerfile')
    })
  })

  describe('fallback', () => {
    it('returns plaintext for unknown extensions', () => {
      expect(detectLanguage('file.xyz')).toBe('plaintext')
    })

    it('returns plaintext for files without extension', () => {
      expect(detectLanguage('LICENSE')).toBe('plaintext')
    })

    it('returns plaintext for empty path', () => {
      expect(detectLanguage('')).toBe('plaintext')
    })
  })

  describe('path handling', () => {
    it('handles Windows-style paths', () => {
      expect(detectLanguage('C:\\Users\\dev\\src\\app.ts')).toBe('typescript')
    })

    it('handles deeply nested paths', () => {
      expect(detectLanguage('/home/user/projects/deep/nested/file.py')).toBe('python')
    })
  })
})
