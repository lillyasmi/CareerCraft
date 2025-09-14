const centerTextPlugin = {
  id: 'centerText',
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    ctx.save();
    const text = chart.config.options.plugins.centerText?.text;
    if (text) {
      ctx.font = 'bold 18px Arial';
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, width / 2, height / 2);
    }
  }
};
