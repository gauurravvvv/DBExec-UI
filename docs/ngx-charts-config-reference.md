# ngx-charts Configuration Reference

## Bar Chart (Vertical/Horizontal)
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| view | number[] | - | [width, height] |
| scheme | object | - | Color scheme |
| legend | boolean | false | Show legend |
| legendTitle | string | 'Legend' | Legend title |
| legendPosition | string | 'right' | 'right' or 'below' |
| xAxis | boolean | false | Show x axis |
| yAxis | boolean | false | Show y axis |
| showGridLines | boolean | true | Show grid |
| roundDomains | boolean | false | Round domains |
| showXAxisLabel | boolean | false | Show x label |
| showYAxisLabel | boolean | false | Show y label |
| xAxisLabel | string | - | X axis text |
| yAxisLabel | string | - | Y axis text |
| **showDataLabel** | boolean | false | Value on bar |
| **noBarWhenZero** | boolean | true | Hide zero bars |
| gradient | boolean | false | Gradient fill |
| **barPadding** | number | 8 | Bar spacing |
| **roundEdges** | boolean | true | Round corners |
| tooltipDisabled | boolean | false | Hide tooltip |
| animations | boolean | true | Animations |

## Line Chart
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| view | number[] | - | [width, height] |
| scheme | object | - | Color scheme |
| legend | boolean | false | Show legend |
| legendTitle | string | 'Legend' | Legend title |
| legendPosition | string | 'right' | Position |
| xAxis | boolean | false | Show x axis |
| yAxis | boolean | false | Show y axis |
| showGridLines | boolean | true | Show grid |
| roundDomains | boolean | false | Round domains |
| showXAxisLabel | boolean | false | Show x label |
| showYAxisLabel | boolean | false | Show y label |
| xAxisLabel | string | - | X axis text |
| yAxisLabel | string | - | Y axis text |
| **timeline** | boolean | false | Timeline control |
| **autoScale** | boolean | false | Auto Y min |
| **curve** | function | - | d3 curve |
| **rangeFillOpacity** | number | 0.15 | Range shadow |
| gradient | boolean | false | Gradient fill |
| tooltipDisabled | boolean | false | Hide tooltip |
| animations | boolean | true | Animations |

## Polar/Radar Chart
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| view | number[] | - | [width, height] |
| scheme | object | - | Color scheme |
| legend | boolean | false | Show legend |
| legendTitle | string | 'Legend' | Legend title |
| legendPosition | string | 'right' | Position |
| xAxis | boolean | false | Show x axis |
| yAxis | boolean | false | Show y axis |
| showGridLines | boolean | true | Show grid |
| roundDomains | boolean | false | Round domains |
| showXAxisLabel | boolean | false | Show x label |
| showYAxisLabel | boolean | false | Show y label |
| xAxisLabel | string | - | X axis text |
| yAxisLabel | string | - | Y axis text |
| **autoScale** | boolean | false | Auto Y min |
| **curve** | function | - | d3 curve |
| **rangeFillOpacity** | number | 0.15 | Range shadow |
| **labelTrim** | boolean | true | Trim labels |
| **labelTrimSize** | number | 10 | Max label len |
| tooltipDisabled | boolean | false | Hide tooltip |
| animations | boolean | true | Animations |

## Pie Chart
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| view | number[] | - | [width, height] |
| scheme | object | - | Color scheme |
| legend | boolean | true | Show legend |
| legendTitle | string | 'Legend' | Legend title |
| legendPosition | string | 'right' | Position |
| **labels** | boolean | false | Show labels |
| **trimLabels** | boolean | true | Trim labels |
| **maxLabelLength** | number | 10 | Max label len |
| **explodeSlices** | boolean | false | Explode slices |
| **doughnut** | boolean | false | Doughnut mode |
| **arcWidth** | number | 0.25 | Arc width |
| gradient | boolean | false | Gradient fill |
| tooltipDisabled | boolean | false | Hide tooltip |
| animations | boolean | true | Animations |

## Legend
- **Pie has NO axes** - no axis options
- **Polar HAS axes** - but uses radial labels differently
- **Bar specific**: showDataLabel, noBarWhenZero, barPadding, roundEdges
- **Line/Area specific**: timeline, autoScale, curve, rangeFillOpacity
- **Polar specific**: labelTrim, labelTrimSize, rangeFillOpacity
- **Pie specific**: labels, trimLabels, maxLabelLength, explodeSlices, doughnut, arcWidth
