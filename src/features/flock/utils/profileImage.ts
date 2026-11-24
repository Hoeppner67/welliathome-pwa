export const MAX_PROFILE_IMAGE_BYTES = 12 * 1024 * 1024
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_EDGE = 640

export async function optimizeProfileImage(file: File): Promise<Blob> {
  if (!allowedTypes.has(file.type)) {
    throw new Error('Bitte wähle ein JPEG-, PNG- oder WebP-Bild aus.')
  }
  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Das Bild darf höchstens 12 MB groß sein.')
  }

  let bitmap: ImageBitmap | undefined
  let objectUrl: string | undefined
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file)
    } else {
      objectUrl = URL.createObjectURL(file)
      const image = await loadImage(objectUrl)
      const canvas = drawScaled(image, image.naturalWidth, image.naturalHeight)
      return await canvasBlob(canvas)
    }

    const canvas = drawScaled(bitmap, bitmap.width, bitmap.height)
    return await canvasBlob(canvas)
  } catch {
    throw new Error('Das Bild konnte nicht gelesen oder verarbeitet werden.')
  } finally {
    bitmap?.close()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

function drawScaled(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  if (!width || !height) throw new Error('Das Bild hat keine gültigen Abmessungen.')
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Die Bildverarbeitung ist nicht verfügbar.')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Das Bild konnte nicht optimiert werden.'))
      },
      'image/webp',
      0.84,
    )
  })
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Bild konnte nicht dekodiert werden.'))
    image.src = url
  })
}
