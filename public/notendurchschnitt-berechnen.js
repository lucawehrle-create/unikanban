// Gewichteter Notenschnitt (Note × ECTS).
;(function () {
  var rows = document.getElementById('rows')
  var defaults = [
    ['2,0', '9'],
    ['1,3', '6'],
    ['2,7', '5'],
  ]
  function num(v) {
    return parseFloat(String(v).replace(',', '.'))
  }
  function addRow(note, ects) {
    var div = document.createElement('div')
    div.className = 'calc-row'
    div.innerHTML =
      '<input inputmode="decimal" placeholder="z. B. 2,0" aria-label="Note" value="' + (note || '') + '">' +
      '<input inputmode="numeric" placeholder="ECTS" aria-label="ECTS" value="' + (ects || '') + '">' +
      '<button class="iconbtn" type="button" aria-label="Entfernen">×</button>'
    div.querySelector('.iconbtn').onclick = function () {
      div.remove()
      calc()
    }
    div.querySelectorAll('input').forEach(function (i) {
      i.addEventListener('input', calc)
    })
    rows.appendChild(div)
  }
  function calc() {
    var rs = rows.querySelectorAll('.calc-row'),
      wsum = 0,
      esum = 0
    rs.forEach(function (r) {
      var ins = r.querySelectorAll('input')
      var n = num(ins[0].value),
        e = num(ins[1].value)
      if (!isNaN(n) && !isNaN(e) && e > 0) {
        wsum += n * e
        esum += e
      }
    })
    document.getElementById('sum').textContent = esum ? String(esum) : '0'
    document.getElementById('avg').textContent = esum ? (wsum / esum).toFixed(2).replace('.', ',') : '–'
  }
  defaults.forEach(function (d) {
    addRow(d[0], d[1])
  })
  document.getElementById('add').onclick = function () {
    addRow('', '')
    calc()
  }
  calc()
})()

// Zielnoten-Rechner: „Was brauche ich noch?"
;(function () {
  function num(v) {
    return parseFloat(String(v).replace(',', '.'))
  }
  function g(id) {
    return document.getElementById(id)
  }
  function fmt(n) {
    return n.toFixed(2).replace('.', ',')
  }
  function calc() {
    var cur = num(g('curAvg').value),
      done = num(g('curEcts').value)
    var goal = num(g('goalAvg').value),
      total = num(g('totalEcts').value)
    var big = g('needBig'),
      sub = g('needSub')
    big.style.fontSize = ''
    if (isNaN(cur) || isNaN(done) || isNaN(goal) || isNaN(total) || done < 0 || total <= done) {
      big.textContent = '–'
      sub.textContent = 'Benötigter Ø in den restlichen ECTS'
      return
    }
    var remaining = total - done
    var needed = (goal * total - cur * done) / remaining
    if (needed < 1) {
      big.style.fontSize = '1.3rem'
      big.textContent = 'nicht erreichbar'
      sub.textContent = 'Selbst mit lauter 1,0 reicht es nicht für ' + fmt(goal) + '.'
    } else if (needed > 4) {
      big.style.fontSize = '1.3rem'
      big.textContent = 'schon sicher'
      sub.textContent = 'Auch mit ausreichenden Noten (4,0) im Rest erreichst du ' + fmt(goal) + '.'
    } else {
      big.textContent = fmt(needed)
      sub.textContent = 'Ø-Note, die du in den restlichen ' + remaining + ' ECTS brauchst'
    }
  }
  ;['curAvg', 'curEcts', 'goalAvg', 'totalEcts'].forEach(function (id) {
    g(id).addEventListener('input', calc)
  })
  calc()
})()
