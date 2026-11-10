import { describe, expect, it } from 'vitest';

import {
  COLORES_SUGERIDOS_DE_NEGOCIO,
  CONTRASTE_MINIMO,
  ICONOS_DE_SELLO,
  ICONO_DE_SELLO_POR_DEFECTO,
  PLANTILLAS_DE_TARJETA,
  PLANTILLA_DE_TARJETA_POR_DEFECTO,
  RUBROS_DE_NEGOCIO,
  TEXTO_SOBRE_CLARO,
  TEXTO_SOBRE_OSCURO,
  TITULOS_DE_RUBRO,
  colorDeTextoSobre,
  contrasteEntre,
  esColorHex,
  esIconoDeSello,
  iconoDeSelloDe,
  selloQueSeDibuja,
  plantillaDeTarjetaDe,
  tituloDeRubro,
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

describe('los rubros', () => {
  it('cada rubro tiene su nombre en pantalla', () => {
    expect(Object.keys(TITULOS_DE_RUBRO).sort()).toEqual([...RUBROS_DE_NEGOCIO].sort());
  });

  it('un rubro conocido se nombra con su titulo', () => {
    expect(tituloDeRubro('estetica')).toBe('Estética y uñas');
  });

  it('uno que la app no conoce cae en "Otros"', () => {
    expect(tituloDeRubro('veterinaria')).toBe('Otros');
  });
});

describe('los colores sugeridos del alta', () => {
  it('son #RRGGBB, que es lo unico que acepta la base', () => {
    expect(COLORES_SUGERIDOS_DE_NEGOCIO.filter((c) => !esColorHex(c))).toEqual([]);
  });

  it('no se repiten', () => {
    expect(new Set(COLORES_SUGERIDOS_DE_NEGOCIO).size).toBe(
      COLORES_SUGERIDOS_DE_NEGOCIO.length,
    );
  });

  it('con cualquiera, el texto encima llega al contraste minimo', () => {
    for (const c of COLORES_SUGERIDOS_DE_NEGOCIO) {
      expect(contrasteEntre(c, colorDeTextoSobre(c))).toBeGreaterThanOrEqual(
        CONTRASTE_MINIMO,
      );
    }
  });
});

describe('selloQueSeDibuja', () => {
  it('un ícono dibujado se estampa tal cual', () => {
    expect(selloQueSeDibuja('corazon', 'https://r2/logo.webp')).toEqual({
      tipo: 'icono',
      icono: 'corazon',
    });
  });

  it('el logo, si el negocio lo eligió y lo tiene', () => {
    expect(selloQueSeDibuja('logo', 'https://r2/logo.webp')).toEqual({
      tipo: 'logo',
      url: 'https://r2/logo.webp',
    });
  });

  it('eligió el logo pero no tiene: el de por defecto, nunca vacío', () => {
    for (const url of [null, undefined, '']) {
      expect(selloQueSeDibuja('logo', url)).toEqual({
        tipo: 'icono',
        icono: ICONO_DE_SELLO_POR_DEFECTO,
      });
    }
  });

  it('un valor que no conoce, o que todavía no llegó: el de por defecto', () => {
    expect(selloQueSeDibuja('cupcake', null)).toEqual({
      tipo: 'icono',
      icono: ICONO_DE_SELLO_POR_DEFECTO,
    });
    expect(selloQueSeDibuja(null, null).tipo).toBe('icono');
  });
});
