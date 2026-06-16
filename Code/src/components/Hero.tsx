import React from 'react';

const Hero: React.FC = () => {
  return (
    <section className="hero-section">
      <div className="hero-content">
        <div className="hero-grid">
          <div className="hero-text">
            <h1 className="hero-title">Bioacoustics for restoration monitoring.</h1>
            <h2 className="hero-subtitle">
              An interactive dashboard exploring how bird communities respond to lantana clearance across monitored sites using passive acoustic monitoring and BirdNET-based detections.
            </h2>
            <p className="hero-description">
              This project uses sound to assess ecological change in restored and lantana-infested habitats. By combining passive acoustic recorder deployments, automated species detections,
              and site-level comparisons, the dashboard helps reveal patterns in species richness, indicator species, and bird activity across the landscape. Passive Acoustic Monitoring (PAM)
              captures continuous soundscapes to track ecological recovery without disturbing wildlife.
            </p>
            <p className="hero-description">
              By analyzing thousands of hours of audio recordings across diverse stations, this platform provides forest departments, conservationists, NGOs, and CSR partners with robust,
              evidence-based insights into ecosystem health to guide future restoration efforts.
            </p>
          </div>

          <div className="hero-visual">
            <div className="featured-image-card">
              <img src="/64789.jpg" alt="White-browed Bulbul perched on twig" className="featured-img" />

            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;

