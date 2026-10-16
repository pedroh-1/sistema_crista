// Testes de integração: sobem a API inteira contra o banco DATABASE_URL_TEST.
// Rodar com: npx nx integracao api
module.exports = {
  displayName: 'api-integracao',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.integracao.ts'],
  setupFiles: ['<rootDir>/test/ambiente.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  maxWorkers: 1,
};
