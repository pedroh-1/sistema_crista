import { Indicador } from './indicador';
import {
  amostraMinima,
  avesAlojadas,
  conversaoAlimentar,
  desvioCurva,
  gpdMedio,
  iep,
  idadeDias,
  mortalidadeAcumulada,
  pesoVivoEmEstoqueKg,
  pesoVivoProduzidoKg,
  saldoAves,
  uniformidade,
  viabilidade,
} from './zootecnicos';
import {
  custoPintos,
  custoPorAveAlojada,
  custoPorKg,
  custoTotal,
  margem,
  ratear,
  receitaPrevista,
} from './financeiros';

const valor = (i: Indicador): number => {
  if (!i.disponivel) throw new Error(`indisponível: ${i.motivo}`);
  return i.valor;
};

// Exemplo de referência de docs/03-indicadores.md
describe('exemplo de referência (lote de 20.000 aves aos 42 dias)', () => {
  const alojadas = avesAlojadas(20000, 100);
  const idade = idadeDias('2026-03-01', '2026-04-12');
  const mortalidade = mortalidadeAcumulada(796, alojadas);
  const viab = viabilidade(mortalidade);
  const saldo = saldoAves(alojadas, 796);
  const pesoEstoque = pesoVivoEmEstoqueKg(saldo, 2900);
  const pesoProduzido = pesoVivoProduzidoKg(pesoEstoque);
  const ca = conversaoAlimentar(94182.72, pesoProduzido);
  const racaoReais = 94182.72 * 1.8;
  const custo = custoTotal(custoPintos(20000, 3), [racaoReais, 30000]);
  const receita = receitaPrevista(pesoEstoque, 6);

  it('calcula as grandezas base', () => {
    expect(alojadas).toBe(19900);
    expect(idade).toBe(42);
    expect(saldo).toBe(19104);
  });

  it('calcula os indicadores zootécnicos', () => {
    expect(valor(mortalidade)).toBeCloseTo(4, 2);
    expect(valor(viab)).toBeCloseTo(96, 2);
    expect(valor(pesoEstoque)).toBeCloseTo(55401.6, 2);
    expect(valor(ca)).toBeCloseTo(1.7, 3);
    expect(valor(iep(viab, 2900, idade, ca))).toBeCloseTo(389.92, 2);
    expect(valor(gpdMedio(2900, 42, idade))).toBeCloseTo(68.05, 2);
  });

  it('calcula os indicadores financeiros', () => {
    expect(custo).toBeCloseTo(259528.9, 2);
    expect(valor(custoPorAveAlojada(custo, alojadas))).toBeCloseTo(13.04, 2);
    expect(valor(custoPorKg(custo, pesoProduzido))).toBeCloseTo(4.68, 2);
    expect(valor(receita)).toBeCloseTo(332409.6, 2);
    expect(valor(margem(receita, custo))).toBeCloseTo(72880.7, 2);
  });
});

describe('indicadores indisponíveis', () => {
  it('CA sem ração e IEP propagam o motivo', () => {
    const ca = conversaoAlimentar(
      null,
      pesoVivoProduzidoKg(pesoVivoEmEstoqueKg(1000, 2000)),
    );
    expect(ca).toEqual({ disponivel: false, motivo: 'Sem registro de ração' });
    expect(
      iep(viabilidade(mortalidadeAcumulada(0, 1000)), 2000, 30, ca),
    ).toEqual(ca);
  });

  it('desvio da curva sem curva de referência', () => {
    expect(desvioCurva(2000, undefined).disponivel).toBe(false);
  });

  it('uniformidade sem pesos individuais', () => {
    expect(uniformidade([]).disponivel).toBe(false);
  });
});

describe('regras auxiliares', () => {
  it('idade soma a idade inicial', () => {
    expect(idadeDias('2026-03-01', '2026-03-01', 1)).toBe(1);
  });

  it('amostra mínima é 1% do saldo ou 50 aves, o que for menor', () => {
    expect(amostraMinima(3000)).toBe(30);
    expect(amostraMinima(20000)).toBe(50);
  });

  it('uniformidade conta aves dentro de ±10% da média', () => {
    // média 110 g: faixa de 99 a 121 g contém as quatro aves de 100 g
    expect(valor(uniformidade([100, 100, 100, 100, 150]))).toBe(80);
  });

  it('rateio fecha o valor exato e a sobra vai para a maior parcela', () => {
    const parcelas = ratear(10000, [1, 1, 1]);
    expect(parcelas.reduce((s, p) => s + p, 0)).toBe(10000);
    expect(parcelas).toEqual([3334, 3333, 3333]);
  });
});
