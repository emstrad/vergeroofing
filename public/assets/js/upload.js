/* Attachments. The bytes go through /api/upload, which tops out near 4MB
   because Vercel will not carry a larger body into a function. Re-encoding is
   what keeps real photos under that: a direct-to-storage path would need a
   client library, and there is no bundler here to carry one.

   Photos are re-encoded through a canvas to 2000px on the long edge, taking a
   3MB camera JPEG to roughly 300KB. On mobile data that is the difference
   between an enquiry and an abandoned form. PDFs go untouched: a competitor's
   quote is the one document worth receiving intact. */
;(function () {
  var MAX_EDGE = 2000
  var PROXY_LIMIT = 4 * 1024 * 1024

  function shrink(file) {
    if (!/^image\//.test(file.type) || /heic/i.test(file.type)) return Promise.resolve(file)
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file)
      var image = new Image()
      image.onload = function () {
        var scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height))
        if (scale === 1 && file.size < 1024 * 1024) {
          URL.revokeObjectURL(url)
          return resolve(file)
        }
        var canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(url)
          /* If re-encoding made it bigger, keep the original. */
          resolve(blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file)
        }, 'image/jpeg', 0.82)
      }
      image.onerror = function () {
        URL.revokeObjectURL(url)
        resolve(file)
      }
      image.src = url
    })
  }

  function query(file) {
    return '?session=' + encodeURIComponent(window.Verge.visit.id) +
      '&name=' + encodeURIComponent(file.name)
  }

  /* Raw bytes with the name in the query string, not multipart: both ends of
     this are ours, and a multipart parser is a hundred lines that exist only to
     undo something the browser did for no reason. */
  async function send(file) {
    if (file.size > PROXY_LIMIT) throw new Error('too large to proxy')
    var res = await fetch('/api/upload' + query(file), {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    })
    if (!res.ok) throw new Error('upload failed')
    var data = await res.json()
    if (!data.path) throw new Error('upload failed')
    return data.path
  }

  async function run() {
    var input = document.getElementById('q-files')
    var status = document.querySelector('[data-upload-status]')
    var result = { paths: [], failed: 0 }
    if (!input || !input.files || !input.files.length) return result

    var files = Array.prototype.slice.call(input.files, 0, 12)
    for (var i = 0; i < files.length; i++) {
      if (status) status.textContent = 'Sending photo ' + (i + 1) + ' of ' + files.length
      var file = await shrink(files[i])
      try {
        result.paths.push(await send(file))
      } catch (e) {
        /* Counted and carried on with. The enquiry is worth more than the
           photo, and the confirmation says which did not arrive. */
        result.failed++
      }
    }
    if (status) status.textContent = ''
    window.Verge.track('upload', { count: String(result.paths.length) })
    return result
  }

  window.Verge = window.Verge || {}
  window.Verge.upload = { run: run }
})()
