;(function () {
  var have = document.getElementById('have'),
    goal = document.getElementById('goal')
  function calc() {
    var h = Math.max(0, parseInt(have.value, 10) || 0)
    var g = parseInt(goal.value, 10) || 180
    var pct = Math.min(100, Math.round((h / g) * 100))
    var left = Math.max(0, g - h)
    document.getElementById('pct').textContent = pct
    document.getElementById('haveOut').textContent = h
    document.getElementById('goalOut').textContent = g
    document.getElementById('left').textContent = left
    document.getElementById('barfill').style.width = pct + '%'
    document.getElementById('sem').textContent = Math.ceil(left / 30)
  }
  have.addEventListener('input', calc)
  goal.addEventListener('change', calc)
  calc()
})()
