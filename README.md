# Praćenje suđenja

Desktop aplikacija (Windows) za unos i analizu podataka sa projekata praćenja suđenja.

## Istorija izmjena

### 1.2.7
- Pri zatvaranju aplikacije prvo se šalju izmjene koje još nijesu poslate na server. Ako slanje ne uspije (nema interneta, potrošen limit), aplikacija to javi i nudi ponovni pokušaj ili zatvaranje; izmjene ostaju sačuvane na računaru i šalju se pri sljedećem pokretanju.
- Tabela 9 kod nasilja nad ženama (Odnos oštećenih i okrivljenih) prikazuje odnose po kategorijama iz izvještaja, grupisane na sadašnji partnerski odnos, bivši partnerski odnos, porodicu i srodstvo i odnose van porodice, sa zbirom za svaku grupu. Odnosi upisani drugačije (npr. otac, brat, sestrična) automatski se svrstavaju u odgovarajuću kategoriju.
- Na listu odnosa žrtve i optuženog dodate su Pastorka i Snaha.
- Kod odnosa van porodice (blisko i površno poznanstvo, profesionalni odnos, slučajni kontakt, nepoznati) pojavljuje se polje za precizniji opis odnosa, uz definiciju izabrane kategorije; kod srodničkih odnosa dodatni opis se ne traži.

### 1.2.6
- Pogrešno dodat unos u koracima sa više unosa (ishod postupka, odlaganje ročišta, mjere procesne discipline, pritvor i sl.) može se obrisati. Briše ga autor unosa, autor predmeta ili administrator.
- U spiskovima optuženih i žrtava može se ukloniti i jedini upisani optuženi odnosno žrtva.
- Novo odlaganje ročišta može se unijeti tek kad je u osnovnim podacima (ili podacima o ponovljenom suđenju) upisan ukupan broj odloženih ročišta, i najviše do tog broja.

### 1.2.5
- U koracima sa više unosa dugme „+ Dodaj” ostaje vidljivo i kad je otvoren neki postojeći unos.

### 1.2.4
- Sinhronizacija troši znatno manje Firebase limita: aplikacija prvo provjeri oznaku izmjena na serveru i preuzima samo liste koje su izmijenjene. Cijela baza se više ne preuzima svaki dan, a sve liste se dodatno provjeravaju na svakih 6 sati.
- Automatska sinhronizacija na svakih 15 minuta (umjesto 5) i odmah nakon čuvanja.
- Upozorenje kad se unosi predmet čiji broj već postoji u istom sudu važi i za nasilje nad ženama.
- Izmijenjena pravila (`firestore.rules`): odobreni korisnici smiju upisati oznaku izmjena.

### 1.2.3
- Glavna sankcija se bira sa liste po Krivičnom zakoniku; dodate su vaspitna mjera, kazna dugotrajnog zatvora i sudska opomena.
- Dodatna polja zavisno od izabrane sankcije: trajanje kazne zatvora, iznos novčane kazne, broj časova rada u javnom interesu, utvrđena kazna i vrijeme provjeravanja kod uslovne osude, sadržina zaštitnog nadzora (čl. 61 KZ) i mjere bezbjednosti (čl. 67 KZ), i kao glavna sankcija i uz drugu sankciju.
- Ishod postupka u Praćenju suđenja i OKK ima više unosa: svaka presuda se dodaje posebno, sa oznakom da li je prvostepena ili pravosnažna, i sankcijama po optuženom. Polja za tekst prvostepene i pravosnažne presude su sklonjena iz forme.
- Nove tabele za izvještaj o sankcijama u sva tri modula (sankcije po vrsti, kazne zatvora po trajanju, uslovne osude, zaštitni nadzor, mjere bezbjednosti, novčane kazne i rad u javnom interesu); kazna dugotrajnog zatvora uračunata u tabelu kazni zatvora.
- U „Uredi tabele” dodata jedinica brojanja „Sankcija optuženog (Ishod postupka)”.
- U pregledu predmeta nasilja nad ženama kolone „Glavna sankcija” i „Oznake” zamijenjene su kolonama „Ranije prijavljivala” i „Nepridruživanje kao olakšavajuće”.

### 1.2.2
- Ispravljen prikaz sankcija i oznake „ranije prijavljivala” u pregledu predmeta nasilja nad ženama (čitali su se stari podaci predmeta umjesto podataka po optuženom i žrtvi).

### 1.2.1
- Pored ZIP-a, svaka verzija ima i instalacioni program (Setup.exe) koji aplikaciju instalira u korisnički folder, pravi prečice i omogućava uklanjanje kroz Windows podešavanja.
- Ažuriranje upisuje novu verziju i u Windows spisak instaliranih programa.

### 1.2.0
- Prijava se pamti samo ako Windows može da je sačuva šifrovano.
- Nesačuvane izmjene vezane su za korisnika koji ih je napravio; drugi korisnik na istom računaru ih ne šalje kao svoje.
- Aplikacija se može pokrenuti samo jednom na istom računaru.
- Predmet briše administrator ili autor predmeta.
- Uvoz provjerava da li su datumi stvarni i prepoznaje decimalni zarez u brojevima; ponovljena suđenja koja se ne mogu povezati sa prvim suđenjem ostaju označena.
- Strožija pravila na serveru (`firestore.rules`): svaki novi zapis nosi autora, a vraćanje obrisanog zapisa može samo administrator.

### 1.1.6
- Aplikacija ne otvara linkove, druge stranice ni nove prozore i ne traži dozvole (kamera, mikrofon i sl.).

### 1.1.5
- Broj verzije se prikazuje u aplikaciji i na ekranu za prijavu.
- Iz podataka o programu (.exe) uklonjeni su podaci o izdavaču i autorskim pravima.

### 1.1.4
- Brže ažuriranje: preskaču se fajlovi koji se nijesu mijenjali i prikazuje se prozor sa napretkom.

### 1.1.3
- Ispravljeno ažuriranje kada su fajlovi stare verzije još bili zauzeti.

### 1.1.2
- Odnos žrtve i optuženog bira se sa liste kategorija (supruga, bivša supruga, vanbračna supruga, emotivna partnerka, srodstvo, poznanstvo i dr.), uz mogućnost da se upiše drugi odnos i neobavezan detaljniji opis.
- Uvoz iz stare aplikacije sam razdvaja više žrtava upisanih u jednom polju.

### 1.1.1
- Novi način samoažuriranja: nova verzija sama zamjenjuje staru nakon zatvaranja aplikacije.

### 1.1.0
- Nasilje nad ženama: u istom predmetu može se upisati više žrtava i više optuženih, a sankcije se upisuju za svakog optuženog.
- Statistika i tabele nasilja nad ženama računaju se po žrtvi i po optuženom.
- Izmijenjena pravila (`firestore.rules`).

### 1.0.1
- Program se zove „Praćenje suđenja”.
- Ispravljene provjere datuma koje su prijavljivale grešku kada jedan od datuma nije upisan.
- Kod ponovljenog suđenja provjera datuma presude gleda samo odlaganja iz tog suđenja.

### 1.0.0
- Prva verzija: moduli Praćenje suđenja, Predmeti organizovanog kriminala i korupcije i Nasilje nad ženama.
- Rad bez interneta, uz sinhronizaciju sa serverom kad se veza vrati; pristup imaju samo korisnici koje odobri administrator.
- Uvoz podataka iz ranijih aplikacija, statistika, tabele za izvještaj i uređivanje formi i tabela za administratora.
- Brisanje svih unosa jednog modula (samo administrator).
- Samoažuriranje sa GitHub izdanja.
