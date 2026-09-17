import { describe, it, expect } from 'vitest';
import { GetFileOutlineTool } from '../src/intelligence/outline.js';

describe('GetFileOutlineTool (TypeScript AST Parser)', () => {
  it('accurately parses classes, interfaces, types, and methods with correct line numbers', () => {
    const tsCode = `
/**
 * Main service interface
 */
export interface IAuthService {
  login(token: string): Promise<boolean>;
}

export type AuthState = 'logged_in' | 'logged_out';

export class AuthenticationManager implements IAuthService {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  public async login(token: string): Promise<boolean> {
    return token.length > 0;
  }
}

export const validateToken = (token: string): boolean => {
  return Boolean(token);
};
`;

    const symbols = GetFileOutlineTool.parseSymbols(tsCode, 'typescript', 'test.ts');

    expect(symbols.length).toBe(5);

    const names = symbols.map((s) => s.name);
    expect(names).toContain('IAuthService');
    expect(names).toContain('AuthState');
    expect(names).toContain('AuthenticationManager');
    expect(names).toContain('login');
    expect(names).toContain('validateToken');

    const iface = symbols.find((s) => s.name === 'IAuthService')!;
    expect(iface.kind).toBe('interface');
    expect(iface.line).toBe(5);

    const typeSym = symbols.find((s) => s.name === 'AuthState')!;
    expect(typeSym.kind).toBe('type');
    expect(typeSym.line).toBe(9);

    const classSym = symbols.find((s) => s.name === 'AuthenticationManager')!;
    expect(classSym.kind).toBe('class');
    expect(classSym.line).toBe(11);

    const methodSym = symbols.find((s) => s.name === 'login')!;
    expect(methodSym.kind).toBe('method');
    expect(methodSym.line).toBe(18);

    const arrowSym = symbols.find((s) => s.name === 'validateToken')!;
    expect(arrowSym.kind).toBe('function');
    expect(arrowSym.line).toBe(23);
  });
});
