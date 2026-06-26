class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold ?? 0.5;
    this.minimumRequests = options.minimumRequests ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.now = options.now ?? Date.now;
    this.estado = 'FECHADO';
    this.sucessos = 0;
    this.falhas = 0;
    this.abertoDesde = null;
  }

  isOpen() {
    if (this.estado !== 'ABERTO') {
      return false;
    }

    if (this.now() - this.abertoDesde >= this.resetTimeoutMs) {
      this.estado = 'MEIO_ABERTO';
      return false;
    }

    return true;
  }

  registrarSucesso() {
    if (this.estado === 'MEIO_ABERTO') {
      this._fechar();
      return;
    }

    this.sucessos += 1;
    this._avaliar();
  }

  registrarFalha() {
    if (this.estado === 'MEIO_ABERTO') {
      this._abrir();
      return;
    }

    this.falhas += 1;
    this._avaliar();
  }

  _avaliar() {
    const total = this.sucessos + this.falhas;

    if (total >= this.minimumRequests && this.falhas / total > this.threshold) {
      this._abrir();
    }
  }

  _abrir() {
    this.estado = 'ABERTO';
    this.abertoDesde = this.now();
    this.sucessos = 0;
    this.falhas = 0;
  }

  _fechar() {
    this.estado = 'FECHADO';
    this.sucessos = 0;
    this.falhas = 0;
  }

  get estadoAtual() {
    return this.estado;
  }
}

module.exports = { CircuitBreaker };
