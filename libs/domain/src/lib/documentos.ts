/** Remove tudo que não for dígito. */
export const somenteDigitos = (valor: string): string =>
  valor.replace(/\D/g, '');

const todosIguais = (digitos: string): boolean => /^(\d)\1*$/.test(digitos);

function digitoVerificador(digitos: string, pesos: readonly number[]): number {
  const soma = pesos.reduce((s, peso, i) => s + Number(digitos[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 11 || todosIguais(d)) return false;
  const d1 = digitoVerificador(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[9]) && d2 === Number(d[10]);
}

export function cnpjValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 14 || todosIguais(d)) return false;
  const d1 = digitoVerificador(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

/** Documento da fazenda (UC02): CPF ou CNPJ. */
export const cpfOuCnpjValido = (valor: string): boolean =>
  cpfValido(valor) || cnpjValido(valor);
