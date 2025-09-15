
let map;
let municipiosLayer;
let municipiosLabels = []; // Array para armazenar as labels dos nomes dos municípios
let municipiosData = {};
let procedimentosData = {};
let populacaoData = {};
let totalGeralDados = 0; // Armazena o total geral dos dados carregados
let currentYear = '2024';


const sheetsUrls = {
  '2019': './csv/pics 2019 - Dados.json',
  '2020': './csv/pics 2020 - Dados.json',
  '2021': './csv/pics 2021 - Dados.json',
  '2022': './csv/pics 2022 - Dados.json',
  '2023': './csv/pics 2023 - Dados.json',
  '2024': './csv/pics 2024 - Dados.json',
  '2025': './csv/pics 2025 - Dados.json'
};

// Função para obter a população do município a partir do feature
// Busca a população pelo nome do município normalizado
function getPopulacaoByFeature(feature) {
  const props = feature?.properties || {};
  const nome = (props.NM_MUN || props.nome || '').toLocaleLowerCase().normalize('NFD').replace(/[^\w\s]/g, '').trim();
  if (nome && populacaoData[nome]) {
    return populacaoData[nome];
  }
  return 0;
}

// Função para calcular a cor baseada na presença de práticas integrativas
function getCorPraticasIntegrativas(feature) {
  const procedimentos = lookupProcedimentosByFeature(feature);
  // Se tem procedimentos/práticas integrativas: azul escuro, senão: cinza
  if (procedimentos && procedimentos > 0) {
    return '#003d7a'; // Azul escuro
  }
  return '#cccccc'; // Cinza
}

function normalizeIBGE(v) {
  if (v === null || v === undefined) return null;
  const digits = String(v).replace(/\D+/g, '');
  if (!digits) return null;

  if (digits.length === 6 || digits.length === 7) return digits;
  return digits;
}


// Função antiga mantida para compatibilidade, mas não será mais usada
function getColor(procedimentos) {
  return '#cccccc';
}

function formatNumber(num) {
  if (num == null || Number.isNaN(num)) return 'N/A';
  try { return Number(num).toLocaleString('pt-BR'); }
  catch { return String(num); }
}


async function initMap() {
  map = L.map('map', {
    center: [-20.4486, -54.6295],
    zoom: 7,
    zoomControl: false,
    crs: L.CRS.Simple
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Adicionar listener para controlar visibilidade dos labels baseado no zoom
  map.on('zoomend', updateLabelsVisibility);

  await loadPopulacaoData();
  loadSVGBackground();
  loadMunicipiosData();
}

// Carrega populacao.json e monta dicionário populacaoData
async function loadPopulacaoData() {
  try {
    const response = await fetch('populacao.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Erro ao carregar populacao.json');
    const data = await response.json();
    populacaoData = {};
    if (Array.isArray(data.municípios)) {
      data.municípios.forEach(mun => {
        const nome = (mun.nome || '').toLocaleLowerCase().normalize('NFD').replace(/[^\w\s]/g, '').trim();
        populacaoData[nome] = mun.população;
      });
    }
  } catch (e) {
    console.error('Erro ao carregar população:', e);
    populacaoData = {};
  }
}

async function loadSVGBackground() {
  try {
    const response = await fetch('MS_Municipios.svg');
    const svgText = await response.text();


    const svgElement = document.createElement('div');
    svgElement.innerHTML = svgText;


    const svg = svgElement.querySelector('svg');
    if (!svg) {
      console.error('SVG inválido');
      return;
    }

    const viewBox = svg.getAttribute('viewBox');
    let bounds;

    if (viewBox) {
      const [minX, minY, width, height] = viewBox.split(' ').map(Number);
      bounds = [[minY, minX], [minY + height, minX + width]];
    } else {

      bounds = [[-24.0, -58.0], [-17.0, -50.0]];
    }


    const svgUrl = 'data:image/svg+xml;base64,' + btoa(svgText);
    L.imageOverlay(svgUrl, bounds, {
      opacity: 0.7,
      interactive: false
    }).addTo(map);

    map.fitBounds(bounds);

  } catch (error) {
    console.error('Erro ao carregar SVG:', error);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors | Usando mapa padrão',
      maxZoom: 18
    }).addTo(map);
  }
}

async function loadMunicipiosData() {
  try {
    const response = await fetch('MS_Municipios_2024.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
    municipiosData = await response.json();


    createMunicipiosLayer();


    await loadProcedimentosData(currentYear);
  } catch (error) {
    console.error('Erro ao carregar dados dos municípios:', error);
    alert('Erro ao carregar dados geográficos dos municípios.');
  }
}

function createMunicipiosLayer() {
  if (municipiosLayer) map.removeLayer(municipiosLayer);

  // Remove labels anteriores
  municipiosLabels.forEach(label => map.removeLayer(label));
  municipiosLabels = [];

  municipiosLayer = L.geoJSON(municipiosData, {
    style: (feature) => {
      return {
        fillColor: getCorPraticasIntegrativas(feature),
        weight: 1,
        opacity: 1,
        color: '#ffffff',
        fillOpacity: 1
      };
    },
    onEachFeature: (feature, layer) => {
      layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: selectMunicipio
      });
    }
  }).addTo(map);

  // Adicionar labels com nomes dos municípios
  addMunicipioLabels();

  try {
    map.fitBounds(municipiosLayer.getBounds(), { padding: [10, 10] });
  } catch { }
}

// Função para adicionar labels com os nomes dos municípios
function addMunicipioLabels() {
  if (!municipiosData.features) return;

  municipiosData.features.forEach(feature => {
    const props = feature.properties;
    const nome = props.NM_MUN || props.nome || 'Sem nome';

    // Calcular o centroide do polígono para posicionar o label
    const bounds = L.geoJSON(feature).getBounds();
    const center = bounds.getCenter();

    // Criar o marker invisível com o nome
    const label = L.divIcon({
      className: 'municipio-label',
      html: `<span class="municipio-name">${nome}</span>`,
      iconSize: [100, 20],
      iconAnchor: [50, 10]
    });

    const marker = L.marker(center, { icon: label, interactive: false });
    marker.addTo(map);
    municipiosLabels.push(marker);
  });
}

// Função para controlar a visibilidade dos labels baseada no nível de zoom
function updateLabelsVisibility() {
  const zoom = map.getZoom();
  const showLabels = zoom >= 8; // Mostrar labels apenas em zoom >= 8

  municipiosLabels.forEach(label => {
    const element = label.getElement();
    if (element) {
      const nameSpan = element.querySelector('.municipio-name');
      if (nameSpan) {
        nameSpan.style.opacity = showLabels ? '1' : '0';
        nameSpan.style.pointerEvents = showLabels ? 'none' : 'none';
      }
    }
  });
}


function lookupProcedimentosByFeature(feature) {
  const cd = feature?.properties?.CD_MUN;
  if (cd == null) return 0;
  const key7 = normalizeIBGE(cd);
  const key6 = key7 ? key7.slice(0, 6) : null;
  if (key7 && procedimentosData[key7] != null) return procedimentosData[key7];
  if (key6 && procedimentosData[key6] != null) return procedimentosData[key6];
  return 0;
}



function highlightFeature(e) {
  const layer = e.target;
  layer.setStyle({ weight: 3, color: '#333333', dashArray: '', fillOpacity: 0.9 });
  layer.bringToFront();
}

function resetHighlight(e) {
  municipiosLayer.resetStyle(e.target);
}


function selectMunicipio(e) {
  const feature = e.target.feature;
  const p = feature.properties;
  const procedimentos = lookupProcedimentosByFeature(feature);
  const populacao = getPopulacaoByFeature(feature);
  const temPraticas = procedimentos > 0 ? 'Sim' : 'Não';

  updateInfoPanel(p, procedimentos, populacao, temPraticas);

  const popupContent = `
    <div>
      <h4>${p.NM_MUN}</h4>
      <div class="popup-info"><span class="popup-label">Código IBGE:</span> <span class="popup-value">${p.CD_MUN}</span></div>
      <div class="popup-info"><span class="popup-label">População:</span> <span class="popup-value">${formatNumber(populacao)}</span></div>
      <div class="popup-info"><span class="popup-label">Procedimentos (${currentYear}):</span> <span class="popup-value">${formatNumber(procedimentos)}</span></div>
      <div class="popup-info"><span class="popup-label">Possui Práticas Integrativas:</span> <span class="popup-value">${temPraticas}</span></div>
      <div class="popup-info"><span class="popup-label">Área:</span> <span class="popup-value">${formatNumber(Math.round(p.AREA_KM2))} km²</span></div>
    </div>
  `;
  e.target.bindPopup(popupContent).openPopup();
}


function updateInfoPanel(p, procedimentos, populacao, temPraticas) {
  const infoDiv = document.getElementById('municipioInfo');
  if (!infoDiv) return;
  infoDiv.innerHTML = `
    <div class="municipio-details">
      <h4>${p.NM_MUN}</h4>
      <div class="detail-item"><span class="detail-label">Código IBGE:</span><span class="detail-value">${p.CD_MUN}</span></div>
      <div class="detail-item"><span class="detail-label">População:</span><span class="detail-value">${formatNumber(populacao)}</span></div>
      <div class="detail-item"><span class="detail-label">Região Imediata:</span><span class="detail-value">${p.NM_RGI ?? '-'}</span></div>
      <div class="detail-item"><span class="detail-label">Estado:</span><span class="detail-value">${p.NM_UF} (${p.SIGLA_UF})</span></div>
      <div class="detail-item"><span class="detail-label">Área:</span><span class="detail-value">${formatNumber(Math.round(p.AREA_KM2))} km²</span></div>
      <div class="detail-item"><span class="detail-label">Procedimentos (${currentYear}):</span><span class="detail-value">${formatNumber(procedimentos)}</span></div>
      <div class="detail-item"><span class="detail-label">Possui Práticas Integrativas:</span><span class="detail-value">${temPraticas}</span></div>
    </div>
  `;
}


function localCsvPath(year) {
  return sheetsUrls[year];
}

async function loadProcedimentosData(year) {
  const loadingIndicator = document.getElementById('loadingIndicator');
  const loadButton = document.getElementById('loadDataBtn');

  loadingIndicator?.classList.add('show');
  if (loadButton) loadButton.disabled = true;

  const url = localCsvPath(year);
  console.log(`Carregando dados do ano ${year} de arquivo local: ${url}`);

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Arquivo não encontrado (${response.status}) — ${url}`);
    const jsonData = await response.json();
    processProcedimentosData(jsonData, year);
  } catch (err) {
    console.error('Erro ao carregar dados dos procedimentos (local):', err);
    alert(`Não foi possível carregar o arquivo local de ${year}.
Verifique se o arquivo existe em /csv e se o servidor está rodando (http://).`);
  } finally {
    loadingIndicator?.classList.remove('show');
    if (loadButton) loadButton.disabled = false;
  }
}

function processProcedimentosData(data, year) {
  console.log('Dados recebidos:', data);

  procedimentosData = {};
  totalGeralDados = 0; // Reset do total

  if (!Array.isArray(data) || data.length === 0) {
    updateMap();
    updateStats();
    return;
  }

  // Verificar se o primeiro elemento contém o total geral
  if (data.length > 0 && data[0].hasOwnProperty('Total')) {
    totalGeralDados = Number(data[0].Total) || 0;
    console.log(`Total geral dos dados de ${year}: ${totalGeralDados}`);
  }

  const sample = data[1] || data[0] || {}; // Usar segundo elemento se primeiro for total, senão primeiro
  const keys = Object.keys(sample);
  const ibgeKey = keys.find(k => /ibge|cd[_ ]?mun|codigo[_ ]?ibge|cod[_ ]?ibge/i.test(k)) || 'IBGE';
  const totalKey = keys.find(k => /total|procedimento/i.test(k)) || 'Total';

  let mapped = 0;
  // Começar do índice 1 se o primeiro elemento for o total geral, senão começar do 0
  const startIndex = (data.length > 0 && data[0].hasOwnProperty('Total') && !data[0].hasOwnProperty('Ibge') && !data[0].hasOwnProperty('IBGE')) ? 1 : 0;

  for (let i = startIndex; i < data.length; i++) {
    const row = data[i];
    const ibgeRaw = row[ibgeKey];
    const totalRaw = row[totalKey];

    const ibgeNorm = normalizeIBGE(ibgeRaw);
    let total = Number(String(totalRaw).replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(total)) total = parseInt(totalRaw) || 0;

    if (!ibgeNorm) continue;

    if (ibgeNorm.length === 7) {
      procedimentosData[ibgeNorm] = total;
      procedimentosData[ibgeNorm.slice(0, 6)] = total;
    } else {
      procedimentosData[ibgeNorm] = total;
    }
    mapped++;
  }

  console.log(`Linhas mapeadas: ${mapped}`);

  updateMap();
  updateStats();
}



function updateMap() {
  if (!municipiosLayer) return;
  municipiosLayer.eachLayer((layer) => {
    layer.setStyle({ fillColor: getCorPraticasIntegrativas(layer.feature) });
  });
}


function updateStats() {
  const totalMunicipios = Array.isArray(municipiosData.features) ? municipiosData.features.length : 0;
  const totais = Object.values(procedimentosData).filter(v => typeof v === 'number' && !Number.isNaN(v));
  const totalProcedimentos = totais.reduce((sum, v) => sum + v, 0);
  const municipiosComDados = new Set(
    Object.keys(procedimentosData).map(k => k.length === 7 ? k : null).filter(Boolean)
  ).size || Object.keys(procedimentosData).length;
  const mediaProcedimentos = municipiosComDados > 0 ? Math.round(totalProcedimentos / municipiosComDados) : 0;

  const elTotalGeral = document.getElementById('totalGeralDados');
  const elTotMun = document.getElementById('totalMunicipios');
  const elTotProc = document.getElementById('totalProcedimentos');
  const elMed = document.getElementById('mediaProcedimentos');

  if (elTotalGeral) elTotalGeral.textContent = formatNumber(totalGeralDados);
  if (elTotMun) elTotMun.textContent = totalMunicipios;
  if (elTotProc) elTotProc.textContent = formatNumber(totalProcedimentos);
  if (elMed) elMed.textContent = formatNumber(mediaProcedimentos);
}


function resetMapView() {
  // Se há dados dos municípios, ajustar para os limites dos municípios
  if (municipiosLayer && municipiosData.features) {
    map.fitBounds(municipiosLayer.getBounds());
  } else {
    // Fallback para coordenadas padrão de MS
    map.setView([-20.4486, -54.6295], 7);
  }
}

function toggleFullscreen() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;
  if (!document.fullscreenElement) {
    mapContainer.requestFullscreen().then(() => setTimeout(() => map.invalidateSize(), 100));
  } else {
    document.exitFullscreen().then(() => setTimeout(() => map.invalidateSize(), 100));
  }
}

// Funções para impressão/relatório
let printMap = null;

function generatePrintReport() {
  const printContainer = document.getElementById('printContainer');
  const printYearInfo = document.getElementById('printYearInfo');
  const municipiosComPraticas = document.getElementById('municipiosComPraticas');
  const estatisticasGerais = document.getElementById('estatisticasGerais');

  // Atualizar informações do cabeçalho
  printYearInfo.textContent = `Ano: ${currentYear} | Total Geral: ${formatNumber(totalGeralDados)}`;

  // Gerar listas de municípios
  generateMunicipiosList(municipiosComPraticas);
  generateEstatisticas(estatisticasGerais);

  // Mostrar container de impressão
  printContainer.style.display = 'block';

  // Criar mapa para impressão
  setTimeout(() => {
    createPrintMap();
  }, 100);
}

function generateMunicipiosList(container) {
  container.innerHTML = '';

  if (!municipiosData.features) return;

  const municipiosComDados = [];
  const municipiosSemDados = [];

  municipiosData.features.forEach(feature => {
    const props = feature.properties;
    const nome = props.NM_MUN || 'Sem nome';
    const procedimentos = lookupProcedimentosByFeature(feature);
    const populacao = getPopulacaoByFeature(feature);

    const municipioInfo = {
      nome: nome,
      procedimentos: procedimentos,
      populacao: populacao,
      ibge: props.CD_MUN
    };

    if (procedimentos > 0) {
      municipiosComDados.push(municipioInfo);
    } else {
      municipiosSemDados.push(municipioInfo);
    }
  });

  // Ordenar por número de procedimentos (decrescente)
  municipiosComDados.sort((a, b) => b.procedimentos - a.procedimentos);
  municipiosSemDados.sort((a, b) => a.nome.localeCompare(b.nome));

  // Adicionar municípios com práticas
  municipiosComDados.forEach(municipio => {
    const item = document.createElement('div');
    item.className = 'municipio-item com-praticas';
    item.innerHTML = `
      <span class="municipio-nome">${municipio.nome}</span>
      <span class="municipio-procedimentos">${formatNumber(municipio.procedimentos)} procedimentos</span>
    `;
    container.appendChild(item);
  });

  // Adicionar separador se houver municípios sem dados
  if (municipiosSemDados.length > 0) {
    const separador = document.createElement('div');
    separador.innerHTML = '<h4 style="margin: 15px 0 10px 0; color: #6c757d; font-size: 14px;">Sem Práticas Integrativas:</h4>';
    container.appendChild(separador);

    municipiosSemDados.forEach(municipio => {
      const item = document.createElement('div');
      item.className = 'municipio-item sem-praticas';
      item.innerHTML = `
        <span class="municipio-nome">${municipio.nome}</span>
        <span class="municipio-procedimentos">0 procedimentos</span>
      `;
      container.appendChild(item);
    });
  }
}

function generateEstatisticas(container) {
  const totalMunicipios = Array.isArray(municipiosData.features) ? municipiosData.features.length : 0;
  const totais = Object.values(procedimentosData).filter(v => typeof v === 'number' && !Number.isNaN(v));
  const totalProcedimentos = totais.reduce((sum, v) => sum + v, 0);

  let municipiosComPraticas = 0;
  let municipiosSemPraticas = 0;

  if (municipiosData.features) {
    municipiosData.features.forEach(feature => {
      const procedimentos = lookupProcedimentosByFeature(feature);
      if (procedimentos > 0) {
        municipiosComPraticas++;
      } else {
        municipiosSemPraticas++;
      }
    });
  }

  const mediaProcedimentos = municipiosComPraticas > 0 ? Math.round(totalProcedimentos / municipiosComPraticas) : 0;
  const percentualCobertura = totalMunicipios > 0 ? ((municipiosComPraticas / totalMunicipios) * 100).toFixed(1) : 0;

  container.innerHTML = `
    <div class="municipio-item">
      <span class="municipio-nome">Total de Municípios</span>
      <span class="municipio-procedimentos">${totalMunicipios}</span>
    </div>
    <div class="municipio-item">
      <span class="municipio-nome">Com Práticas Integrativas</span>
      <span class="municipio-procedimentos">${municipiosComPraticas} (${percentualCobertura}%)</span>
    </div>
    <div class="municipio-item">
      <span class="municipio-nome">Sem Práticas Integrativas</span>
      <span class="municipio-procedimentos">${municipiosSemPraticas}</span>
    </div>
    <div class="municipio-item">
      <span class="municipio-nome">Total de Procedimentos</span>
      <span class="municipio-procedimentos">${formatNumber(totalProcedimentos)}</span>
    </div>
    <div class="municipio-item">
      <span class="municipio-nome">Total Geral dos Dados</span>
      <span class="municipio-procedimentos">${formatNumber(totalGeralDados)}</span>
    </div>
    <div class="municipio-item">
      <span class="municipio-nome">Média por Município (c/ práticas)</span>
      <span class="municipio-procedimentos">${formatNumber(mediaProcedimentos)}</span>
    </div>
  `;
}

function createPrintMap() {
  const printMapElement = document.getElementById('printMap');

  if (printMap) {
    printMap.remove();
  }

  printMap = L.map(printMapElement, {
    center: [-20.4486, -54.6295],
    zoom: 7,
    zoomControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    crs: L.CRS.Simple
  });

  // Adicionar SVG de fundo
  if (municipiosData) {
    const printMunicipiosLayer = L.geoJSON(municipiosData, {
      style: (feature) => {
        return {
          fillColor: getCorPraticasIntegrativas(feature),
          weight: 1,
          opacity: 1,
          color: '#ffffff',
          fillOpacity: 1
        };
      }
    }).addTo(printMap);

    try {
      printMap.fitBounds(printMunicipiosLayer.getBounds(), { padding: [10, 10] });
    } catch { }

    // Adicionar labels dos municípios para impressão
    if (municipiosData.features) {
      municipiosData.features.forEach(feature => {
        const props = feature.properties;
        const nome = props.NM_MUN || props.nome || 'Sem nome';
        const procedimentos = lookupProcedimentosByFeature(feature);

        // Só mostrar labels para municípios com práticas integrativas
        if (procedimentos > 0) {
          const bounds = L.geoJSON(feature).getBounds();
          const center = bounds.getCenter();

          const label = L.divIcon({
            className: 'municipio-label',
            html: `<span class="municipio-name">${nome}</span>`,
            iconSize: [100, 20],
            iconAnchor: [50, 10]
          });

          L.marker(center, { icon: label, interactive: false }).addTo(printMap);
        }
      });
    }
  }
}

function closePrintReport() {
  const printContainer = document.getElementById('printContainer');
  printContainer.style.display = 'none';

  if (printMap) {
    printMap.remove();
    printMap = null;
  }
}

function doPrint() {
  window.print();
}


document.addEventListener('DOMContentLoaded', () => {
  initMap();

  const yearSelect = document.getElementById('yearSelect');
  if (yearSelect) {
    yearSelect.value = currentYear;
    yearSelect.addEventListener('change', function () {
      currentYear = this.value;
      loadProcedimentosData(currentYear);
    });
  }

  const loadDataBtn = document.getElementById('loadDataBtn');
  if (loadDataBtn) loadDataBtn.addEventListener('click', () => loadProcedimentosData(currentYear));

  const resetViewBtn = document.getElementById('resetView');
  if (resetViewBtn) resetViewBtn.addEventListener('click', resetMapView);

  const fullscreenBtn = document.getElementById('fullscreen');
  if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);

  const printReportBtn = document.getElementById('printReport');
  if (printReportBtn) printReportBtn.addEventListener('click', generatePrintReport);

  const doPrintBtn = document.getElementById('doPrint');
  if (doPrintBtn) doPrintBtn.addEventListener('click', doPrint);

  const closePrintBtn = document.getElementById('closePrint');
  if (closePrintBtn) closePrintBtn.addEventListener('click', closePrintReport);

  document.addEventListener('fullscreenchange', () => {
    const b = document.getElementById('fullscreen');
    if (!b) return;
    b.textContent = document.fullscreenElement ? 'Sair Tela Cheia' : 'Tela Cheia';
  });
});

window.addEventListener('resize', () => {
  if (map) setTimeout(() => map.invalidateSize(), 100);
});
