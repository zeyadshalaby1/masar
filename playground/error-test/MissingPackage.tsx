// Broken on purpose for /errors: imports a package that is not installed.
import confetti from 'canvas-confetti-not-installed'

export default function MissingPackage() {
  confetti()
  return null
}
