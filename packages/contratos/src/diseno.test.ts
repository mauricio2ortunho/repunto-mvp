import { describe, expect, it } from 'vitest';

import {
  CONTRASTE_MINIMO,
  ICONOS_DE_SELLO,
  ICONO_DE_SELLO_POR_DEFECTO,
  PLANTILLAS_DE_TARJETA,
  PLANTILLA_DE_TARJETA_POR_DEFECTO,
  TEXTO_SOBRE_CLARO,
  TEXTO_SOBRE_OSCURO,
  colorDeTextoSobre,
  contrasteEntre,
  esColorHex,
  esIconoDeSello,
  iconoDeSelloDe,
  plantillaDeTarjetaDe,
} from './diseno';

describe('contrasteEntre', () => {
  it('blanco contra negro es el maximo, 21', () => {
    expect(contrasteEntre('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });

  it('un color contra si mismo es 1', () => {
    expect(contrasteEntre('#1A2B3C', '#1A2B3C')).toBeCloseTo(1, 10);
  });

  it('es simetrica: no importa cual va de fondo', () => {
    expect(contrasteEntre('#1A2B3C', '#FFFFFF')).toBeCloseTo(
      contrasteEntre('#FFFFFF', '#1A2B3C'),
      10,
    );
  });

  it('no distingue mayusculas de minusculas', () => {
    expect(contrasteEntre('#1a2b3c', '#FFFFFF')).toBeCloseTo(
      contrasteEntre('#1A2B3C', '#FFFFFF'),
      10,
    );
  });

  it('con algo que no es un color, 0', () => {
    expect(contrasteEntre('violeta', '#FFFFFF')).toBe(0);
  });
});

describe('colorDeTextoSobre', () => {
  it.each([
    ['un fondo oscuro', '#1A2B3C', TEXTO_SOBRE_OSCURO],
    ['negro', '#000000', TEXTO_SOBRE_OSCURO],
    ['un fondo claro', '#FFE066', TEXTO_SOBRE_CLARO],
    ['blanco', '#FFFFFF', TEXTO_SOBRE_CLARO],
  ])('sobre %s elige el que se lee', (_caso, fondo, esperado) => {
    expect(colorDeTextoSobre(fondo)).toBe(esperado);
  });

  it('con un color que no se puede leer, devuelve el oscuro', () => {
    expect(colorDeTextoSobre('rgb(1,2,3)')).toBe(TEXTO_SOBRE_CLARO);
  });

  /**
   * El test que sostiene la regla entera: cualquier color que un dueño elija
   * tiene que quedar legible sin que nadie lo revise. Si alguien cambia los
   * dos colores de texto por un casi-blanco o un casi-negro, esto falla.
   */
  it('recorre la gama entera y nunca baja del minimo de WCAG', () => {
    let peor = { fondo: '', contraste: Infinity };

    for (let r = 0; r < 256; r += 15) {
      for (let g = 0; g < 256; g += 15) {
        for (let b = 0; b < 256; b += 15) {
          const fondo = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
          const contraste = contrasteEntre(fondo, colorDeTextoSobre(fondo));
          if (contraste < peor.contraste) peor = { fondo, contraste };
        }
      }
    }

    expect(peor.contraste, `el peor fondo fue ${peor.fondo}`).toBeGreaterThanOrEqual(
      CONTRASTE_MINIMO,
    );
  });
});

describe('esColorHex', () => {
  it.each(['#1A2B3C', '#ffffff', '#000000'])('acepta %s', (valor) => {
    expect(esColorHex(valor)).toBe(true);
  });

  it.each(['1A2B3C', '#1A2B3', '#1A2B3CC', '#GGGGGG', 'rojo', ''])(
    'rechaza %s',
    (valor) => {
      expect(esColorHex(valor)).toBe(false);
    },
  );
});

describe('los valores de diseño', () => {
  it('el icono por defecto es uno de la lista', () => {
    expect(esIconoDeSello(ICONO_DE_SELLO_POR_DEFECTO)).toBe(true);
  });

  it('un valor conocido se respeta', () => {
    expect(iconoDeSelloDe('corazon')).toBe('corazon');
    expect(plantillaDeTarjetaDe('minima')).toBe('minima');
  });

  /**
   * Lo que hace que agregar un icono en la base no rompa una app que todavia
   * no lo conoce: dibuja el de por defecto en lugar de quedarse sin nada.
   */
  it('uno que esta app no conoce cae en el de por defecto', () => {
    expect(iconoDeSelloDe('cupcake')).toBe(ICONO_DE_SELLO_POR_DEFECTO);
    expect(plantillaDeTarjetaDe('futurista')).toBe(PLANTILLA_DE_TARJETA_POR_DEFECTO);
  });

  it('no hay valores repetidos', () => {
    expect(new Set(ICONOS_DE_SELLO).size).toBe(ICONOS_DE_SELLO.length);
    expect(new Set(PLANTILLAS_DE_TARJETA).size).toBe(PLANTILLAS_DE_TARJETA.length);
  });
});
